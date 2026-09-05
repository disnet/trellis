#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    time::Duration,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

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

struct Backend(Mutex<Child>);
impl Drop for Backend {
    fn drop(&mut self) {
        if let Ok(child) = self.0.get_mut() {
            stop_backend(child);
        }
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let runtime = if cfg!(debug_assertions) {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime")
            } else {
                app.path().resource_dir()?.join("runtime")
            };
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let mut child =
                Command::new(runtime.join(if cfg!(windows) { "node.exe" } else { "node" }))
                    .arg(runtime.join("server.mjs"))
                    .current_dir(&data)
                    .env("TRELLIS_DESKTOP", "1")
                    .env("TRELLIS_DB", data.join("trellis.db"))
                    .env("TRELLIS_SETTINGS", data.join("settings.json"))
                    .env_remove("NODE_OPTIONS")
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::inherit())
                    .spawn()?;
            let stdout = child.stdout.take().ok_or("Server output is unavailable")?;
            let backend = Backend(Mutex::new(child));
            let (tx, rx) = mpsc::channel();
            std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    if let Some(url) = line.strip_prefix("TRELLIS_READY ") {
                        let _ = tx.send(url.to_string());
                    } else {
                        eprintln!("{line}");
                    }
                }
            });
            let url: tauri::Url = rx
                .recv_timeout(Duration::from_secs(30))
                .map_err(|_| "Trellis could not start its local server within 30 seconds")?
                .parse()?;
            let origin = url.origin();
            let handle = app.handle().clone();
            let new_window_handle = handle.clone();
            app.manage(backend);
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
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
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Could not launch Trellis");
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
