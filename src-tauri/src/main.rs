#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{
    fs::File,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
// A release build is a Windows GUI app with no console of its own, so spawning
// the server would otherwise open and flash a console window on screen.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const READY_TIMEOUT: Duration = Duration::from_secs(30);

// That same missing console means a printed error reaches nobody: a failed
// start would just be a window that never appears. Everything the server says
// goes to a log file beside the database, and a failure to start also reaches
// the screen as a dialog, carrying the end of that log with it.
#[derive(Clone)]
struct Journal {
    path: PathBuf,
    file: Arc<Mutex<Option<File>>>,
    tail: Arc<Mutex<Vec<String>>>,
}

impl Journal {
    fn new(path: PathBuf) -> Self {
        let file = File::create(&path).ok();
        Journal { path, file: Arc::new(Mutex::new(file)), tail: Arc::new(Mutex::new(Vec::new())) }
    }

    fn line(&self, line: &str) {
        if let Ok(mut file) = self.file.lock() {
            if let Some(file) = file.as_mut() {
                let _ = writeln!(file, "{line}");
            }
        }
        // A server that dies on startup explains itself in its last few lines,
        // which is exactly what the failure dialog needs to show.
        if let Ok(mut tail) = self.tail.lock() {
            tail.push(line.to_string());
            if tail.len() > 20 {
                tail.remove(0);
            }
        }
    }

    fn tail(&self) -> String {
        self.tail.lock().map(|tail| tail.join("\n")).unwrap_or_default()
    }
}

fn report(message: String) -> ! {
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title("Trellis could not start")
        .set_description(message)
        .show();
    std::process::exit(1);
}

fn fail(journal: &Journal, message: &str) -> ! {
    let tail = journal.tail();
    journal.line(message);
    let mut body = message.to_string();
    if !tail.is_empty() {
        body.push_str(&format!("\n\nThe server's last output:\n{tail}"));
    }
    body.push_str(&format!("\n\nThe full log is at {}.", journal.path.display()));
    report(body)
}

fn stop_backend(child: &mut Child) {
    // Let Node clean up in-flight CLI processes before falling back to a kill.
    drop(child.stdin.take());
    for _ in 0..40 {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// How a server that closed its output ended, once it has finished exiting.
fn exit_status(child: &mut Child) -> Option<ExitStatus> {
    for _ in 0..40 {
        match child.try_wait() {
            Ok(Some(status)) => return Some(status),
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => return None,
        }
    }
    None
}

struct Backend(Mutex<Child>);
impl Drop for Backend {
    fn drop(&mut self) {
        if let Ok(child) = self.0.get_mut() {
            stop_backend(child);
        }
    }
}

fn data_directory(app: &tauri::App) -> Result<PathBuf, String> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Trellis could not locate its data folder: {error}"))?;
    std::fs::create_dir_all(&data)
        .map_err(|error| format!("Trellis could not create its data folder at {}: {error}", data.display()))?;
    Ok(data)
}

fn ready_url(child: &mut Child, ready: &mpsc::Receiver<String>) -> Result<tauri::Url, String> {
    // The sender lives in the thread reading the server's output, so a server
    // that exits early ends this wait rather than sitting out the timeout.
    let line = match ready.recv_timeout(READY_TIMEOUT) {
        Ok(line) => line,
        Err(_) => {
            return Err(match exit_status(child) {
                Some(status) => format!("The Trellis server stopped before it was ready ({status})."),
                None => format!(
                    "The Trellis server did not become ready within {} seconds.",
                    READY_TIMEOUT.as_secs()
                ),
            })
        }
    };
    line.parse()
        .map_err(|error| format!("The server reported an address Trellis cannot open: {error}"))
}

/// Strips the Windows verbatim prefix (`\\?\`) that `resource_dir` returns for
/// an installed build.
///
/// Node cannot take such a path as its entry point: its resolver reads the
/// `\\?\` as the start of a UNC share, and `node \\?\C:\...\server.mjs` dies in
/// `realpathSync` before the server's first line ever runs. Length is not a
/// reason to keep the prefix either, since Node applies it itself for the
/// syscalls that need it.
fn plain(path: PathBuf) -> PathBuf {
    let Some(text) = path.to_str() else { return path };
    // `\\?\UNC\server\share` is the verbatim spelling of `\\server\share`;
    // dropping the whole prefix there would strip the host off the path.
    if let Some(share) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{share}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path
}

fn start(app: &tauri::App, data: &Path, journal: &Journal) -> Result<(), String> {
    let runtime = plain(if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime")
    } else {
        app.path()
            .resource_dir()
            .map_err(|error| format!("Trellis could not locate its program files: {error}"))?
            .join("runtime")
    });
    let node = runtime.join(if cfg!(windows) { "node.exe" } else { "node" });
    let server = runtime.join("server.mjs");
    // Named plainly here, because a half-installed app otherwise fails as a
    // bare "file not found" with no indication of which file.
    for file in [&node, &server] {
        if !file.exists() {
            return Err(format!(
                "Part of the Trellis installation is missing: {}. Reinstalling should replace it.",
                file.display()
            ));
        }
    }

    let mut command = Command::new(&node);
    command
        .arg(&server)
        .current_dir(data)
        .env("TRELLIS_DESKTOP", "1")
        .env("TRELLIS_DB", data.join("trellis.db"))
        .env("TRELLIS_SETTINGS", data.join("settings.json"))
        .env_remove("NODE_OPTIONS")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        // Piped, not inherited: a GUI build has no usable stderr to hand the
        // server, and an undrained pipe would block it.
        .stderr(Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    journal.line(&format!("Starting {} {}", node.display(), server.display()));
    let mut child = command
        .spawn()
        .map_err(|error| format!("Trellis could not run its server at {}: {error}", node.display()))?;

    let stdout = child.stdout.take().ok_or("Server output is unavailable")?;
    let stderr = child.stderr.take().ok_or("Server output is unavailable")?;
    let errors = journal.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            errors.line(&line);
        }
    });
    let (tx, rx) = mpsc::channel();
    let output = journal.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(url) = line.strip_prefix("TRELLIS_READY ") {
                let _ = tx.send(url.to_string());
            } else {
                output.line(&line);
            }
        }
    });

    let url = match ready_url(&mut child, &rx) {
        Ok(url) => url,
        Err(error) => {
            stop_backend(&mut child);
            return Err(error);
        }
    };
    journal.line("The server is ready.");
    let origin = url.origin();
    let handle = app.handle().clone();
    let new_window_handle = handle.clone();
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("Trellis")
        .inner_size(1440.0, 960.0)
        .min_inner_size(800.0, 600.0)
        .on_navigation(move |url| {
            if url.origin() == origin {
                return true;
            }
            if matches!(url.scheme(), "https" | "http") {
                let _ = handle.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .on_new_window(move |url, _| {
            if matches!(url.scheme(), "https" | "http") {
                let _ = new_window_handle
                    .opener()
                    .open_url(url.as_str(), None::<&str>);
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .build();
    if let Err(error) = window {
        stop_backend(&mut child);
        // WebView2 missing or blocked is the usual reason on Windows.
        return Err(format!("Trellis could not open its window: {error}"));
    }
    app.manage(Backend(Mutex::new(child)));
    Ok(())
}

fn main() {
    let app = match tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data = data_directory(app);
            let journal = Journal::new(
                data.clone().unwrap_or_else(|_| std::env::temp_dir()).join("trellis.log"),
            );
            match data {
                Ok(data) => {
                    if let Err(error) = start(app, &data, &journal) {
                        fail(&journal, &error);
                    }
                }
                Err(error) => fail(&journal, &error),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
    {
        Ok(app) => app,
        // Rare next to a failed setup, but a panic here is just as silent.
        Err(error) => report(format!("Trellis could not start.\n\n{error}")),
    };
    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(backend) = handle.try_state::<Backend>() {
                if let Ok(mut child) = backend.0.lock() {
                    stop_backend(&mut child);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exiting_server(code: i32) -> Child {
        let mut command = if cfg!(windows) {
            let mut command = Command::new("cmd");
            command.args(["/c", &format!("exit {code}")]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", &format!("exit {code}")]);
            command
        };
        command.stdout(Stdio::piped()).spawn().expect("the shell should run")
    }

    // The failure that started all this: a server that dies on startup used to
    // leave the user with no window and no reason. It must be named, and named
    // as soon as the server's output ends rather than after the full timeout.
    #[test]
    fn a_server_that_exits_is_named_without_waiting_out_the_timeout() {
        let mut child = exiting_server(3);
        let (ready, rx) = mpsc::channel::<String>();
        drop(ready); // As when the thread reading the server's output reaches its end.
        let started = std::time::Instant::now();
        let error = ready_url(&mut child, &rx).expect_err("an exited server has no address");
        assert!(error.contains("stopped before it was ready"), "{error}");
        assert!(started.elapsed() < READY_TIMEOUT);
    }

    #[test]
    fn the_address_the_server_reports_becomes_the_window_url() {
        let mut child = exiting_server(0);
        let (ready, rx) = mpsc::channel();
        ready.send("http://127.0.0.1:51234/__desktop/token".to_string()).expect("the channel is open");
        let url = ready_url(&mut child, &rx).expect("a reported address parses");
        assert_eq!(url.origin().ascii_serialization(), "http://127.0.0.1:51234");
    }

    #[test]
    fn the_journal_writes_every_line_down_and_keeps_the_end_for_the_dialog() {
        let path = std::env::temp_dir().join(format!("trellis-journal-{}.log", std::process::id()));
        let journal = Journal::new(path.clone());
        for line in 0..25 {
            journal.line(&format!("line {line}"));
        }
        let tail = journal.tail();
        assert!(tail.starts_with("line 5"), "{tail}");
        assert!(tail.ends_with("line 24"), "{tail}");
        let written = std::fs::read_to_string(&path).expect("the log is on disk");
        assert!(written.starts_with("line 0"), "{written}");
        std::fs::remove_file(&path).ok();
    }

    // An installed Windows build handed Node a `\\?\` path and got a window
    // that never appeared, so the prefix has to be gone before Node sees it.
    #[test]
    fn a_verbatim_windows_path_reaches_node_in_its_ordinary_form() {
        assert_eq!(
            plain(PathBuf::from(r"\\?\C:\Users\someone\AppData\Local\Trellis\runtime")),
            PathBuf::from(r"C:\Users\someone\AppData\Local\Trellis\runtime")
        );
    }

    #[test]
    fn a_verbatim_share_keeps_the_host_it_is_served_from() {
        assert_eq!(
            plain(PathBuf::from(r"\\?\UNC\build-server\apps\Trellis\runtime")),
            PathBuf::from(r"\\build-server\apps\Trellis\runtime")
        );
    }

    #[test]
    fn an_ordinary_path_is_left_exactly_as_it_is() {
        for path in [r"C:\Program Files\Trellis\runtime", "/Applications/Trellis.app/runtime"] {
            assert_eq!(plain(PathBuf::from(path)), PathBuf::from(path));
        }
    }
}
