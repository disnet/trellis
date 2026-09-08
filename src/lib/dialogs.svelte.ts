// In-app confirm/prompt, replacing window.confirm()/prompt(): the desktop
// WebView implements neither (they return undefined immediately), and the
// native chrome never belonged on the desk anyway. One dialog at a time.

export interface DialogState {
	kind: 'confirm' | 'prompt';
	message: string;
	confirmLabel: string;
	/** Prompt only: initial input value. */
	initial: string;
	/** Prompt only: keep input within the receiving field's limit. */
	maxLength?: number;
	resolve: (value: boolean | string | null) => void;
}

class Dialogs {
	current = $state<DialogState | null>(null);

	confirm(message: string, confirmLabel = 'Confirm'): Promise<boolean> {
		this.current?.resolve(this.current.kind === 'confirm' ? false : null);
		return new Promise((resolve) => {
			this.current = {
				kind: 'confirm',
				message,
				confirmLabel,
				initial: '',
				resolve: resolve as DialogState['resolve']
			};
		});
	}

	prompt(message: string, initial = '', confirmLabel = 'Save', maxLength = 80): Promise<string | null> {
		this.current?.resolve(this.current.kind === 'confirm' ? false : null);
		return new Promise((resolve) => {
			this.current = {
				kind: 'prompt',
				maxLength,
				message,
				confirmLabel,
				initial,
				resolve: resolve as DialogState['resolve']
			};
		});
	}

	/** Called by the dialog component with the outcome. */
	settle(value: boolean | string | null) {
		const d = this.current;
		this.current = null;
		d?.resolve(value);
	}
}

export const dialogs = new Dialogs();
