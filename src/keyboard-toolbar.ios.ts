import * as application from "tns-core-modules/application";
import { screen } from "tns-core-modules/platform";
import { View, ViewBase } from "tns-core-modules/ui/core/view";
import { Frame } from "@nativescript/core";
import { EditableTextBase } from "tns-core-modules/ui/editable-text-base";
import { AnimationCurve } from "tns-core-modules/ui/enums";
import { Page } from "tns-core-modules/ui/page";
import { ToolbarBase } from "./keyboard-toolbar.common";

declare const IQKeyboardManager: any;

const ATTEMPT_TIMES = 10;

export class Toolbar extends ToolbarBase {
	private startPositionY: number;
	private lastHeight: number;
	private lastKeyboardHeight: number;
	private keyboardNotificationObserver: any;
	private hasIQKeyboardManagerInstalled: boolean = false;
	private iqKeyboardManagerOriginalDistance: number = 0;
	shouldPreventToolbarDismiss = false


	protected _loaded(): void {
		this.keyboardNotificationObserver = application.ios.addNotificationObserver(
			UIKeyboardWillChangeFrameNotification,
			(notification) => {
				const newKeyboardHeight = notification.userInfo.valueForKey(
					UIKeyboardFrameEndUserInfoKey
				).CGRectValue.size.height;

				if (newKeyboardHeight === this.lastKeyboardHeight) {
					return;
				}

				const isFirstAnimation = this.lastKeyboardHeight === undefined;
				this.lastKeyboardHeight = newKeyboardHeight;

				if (!isFirstAnimation && this.hasFocus) {
					const parent = (<View>this.content.parent);
					showKeyboard(parent);
				}
			}
		);

		const showKeyboard = (parent) => {
			if (this.hasIQKeyboardManagerInstalled) {
				IQKeyboardManager.sharedManager().keyboardDistanceFromTextField =
					this.iqKeyboardManagerOriginalDistance + parent.height;
			}

			this.hasFocus = true;
			this.shouldPreventToolbarDismiss = true;
			// wrap in a timeout, to make sure this runs after 'UIKeyboardWillChangeFrameNotification'
			setTimeout(() => {
				const animateToY =
					this.startPositionY -
					this.lastKeyboardHeight -
					(this.showWhenKeyboardHidden === true
						? 0
						: this.lastHeight / screen.mainScreen.scale);
				this.log("focus, animateToY: " + animateToY);
				this.shouldPreventToolbarDismiss = false;
				parent
					.animate({
						translate: { x: 0, y: animateToY },
						// see http://cubic-bezier.com/#.17,.67,.69,1.04
						curve: AnimationCurve.cubicBezier(
							0.32,
							0.49,
							0.56,
							1
						),
						duration: 250,
					})
					.then(() => {
						parent.notify({
							eventName: Toolbar.heightChangedEvent,
							object: parent,
							info: {
								animateToY: Math.abs(animateToY),
								lastKeyboardHeight: this
									.lastKeyboardHeight,
							},
						});
					});
			}, 150);
		}

		const hideKeyboard = (parent) => {
			if (this.hasIQKeyboardManagerInstalled) {
				IQKeyboardManager.sharedManager().keyboardDistanceFromTextField = this.iqKeyboardManagerOriginalDistance;
			}

			this.hasFocus = false;
			setTimeout(() => {
				if(this.shouldPreventToolbarDismiss) {
					this.shouldPreventToolbarDismiss = false;
					return;
				}
				const animateToY =
					this.showWhenKeyboardHidden === true &&
					this.showAtBottomWhenKeyboardHidden !== true
						? 0
						: this.startPositionY;
				this.log("blur, animateToY: " + animateToY);

				parent
					.animate({
						translate: { x: 0, y: animateToY },
						curve: AnimationCurve.cubicBezier(
							0.32,
							0.49,
							0.56,
							1
						), // perhaps make this one a little different as it's the same as the 'show' animation
						duration: 250,
					})
					.then(() => {
						parent.notify({
							eventName: Toolbar.heightChangedEvent,
							object: parent,
							info: {
								animateToY: Math.abs(animateToY),
								lastKeyboardHeight: this.lastKeyboardHeight,
							},
						});
					});


			}, 150);
		}

		const onViewForIdFound = (forView: ViewBase) => {
			const parent = this.content.parent as View;

			// experimental support for non-text widgets.. but not sure if this is useful, so not documenting it yet
			const isText = forView instanceof EditableTextBase;

			this.hasIQKeyboardManagerInstalled =
				typeof IQKeyboardManager !== "undefined";
			this.iqKeyboardManagerOriginalDistance = this.hasIQKeyboardManagerInstalled
				? IQKeyboardManager.sharedManager()
						.keyboardDistanceFromTextField
				: 0;

			if (isText) {
				// If the embed text field has been focused before we apply the event listener, we should show the tool bar manually.
				if(this.hasFocus) {
          			showKeyboard(parent);
        		}
				forView.notify({
					eventName: Toolbar.viewFoundedEvent,
					object: forView,
				});
				forView.on("focus", () => {
					showKeyboard(parent);
				});

				forView.on("blur", () => {
					hideKeyboard(parent);
				});
			} else {
				// it's not a text widget, so just animate the toolbar
				forView.on("tap", () => {
					const animateToY =
						this.startPositionY -
						this.lastHeight / screen.mainScreen.scale;
					this.log("tap, animateToY: " + animateToY);
					parent
						.animate({
							translate: { x: 0, y: animateToY },
							// see http://cubic-bezier.com/#.17,.67,.69,1.04
							curve: AnimationCurve.cubicBezier(
								0.32,
								0.49,
								0.56,
								1
							),
							duration: 250,
						})
						.then(() => {});
				});
			}
		};

		// TODO this can be reused on Android (but I haven't seen the underlying issue there (yet))
		this.getViewForId(ATTEMPT_TIMES)
			.then((view) => {
				if(Array.isArray(view)) {
                    view.forEach(viewItem => {onViewForIdFound(viewItem)});
                } else {
                    onViewForIdFound(view);
                }
			})
			.catch(() =>
				console.log(
					`\n⌨ ⌨ ⌨ Please make sure forId="<view id>" resolves to a visible view, or the toolbar won't render correctly! Example: <Toolbar forId="myId" height="44">\n\n`
				)
			);
	}

	// depending on the framework (looking at you, Angular!) it may take longer to find the view, so here we try to get it asap (instead of a fixed 1sec timeout for instance)
	private getViewForId(attemptsLeft: number): Promise<ViewBase | ViewBase[]> {
		return new Promise<ViewBase | ViewBase[]>((resolve, reject) => {
			if (attemptsLeft-- > 0) {
				setTimeout(() => {
					let pg;
					if (Frame.topmost()) {
						pg = Frame.topmost().currentPage;
					} else {
						pg = this.content.parent;
						while (pg && !(pg instanceof Page)) {
							pg = pg.parent;
						}
					}
					const page = <Page>pg;

					if (this.forView) {
                        resolve(this.forView)
					}

					let found: ViewBase | ViewBase[];
                    if(Array.isArray(this.forId)) {
                        found = this.forId.map(id => {
                            return page && page.modal
							? page.modal.getViewById(id)
							: page && page.getViewById(id);
                        });
                    } else {
                        found = page && page.modal
						? page.modal.getViewById(this.forId)
						: page && page.getViewById(this.forId);
                    }
					if (found) {
						resolve(found);
					} else {
						this.getViewForId(attemptsLeft)
							.then(resolve)
							.catch(reject);
					}
				}, attemptsLeft * 30);
			} else {
				reject();
			}
		});
	}

	protected _unloaded(): void {
		application.ios.removeNotificationObserver(
			this.keyboardNotificationObserver,
			UIKeyboardWillChangeFrameNotification
		);
	}

	protected _layout(
		left: number,
		top: number,
		right: number,
		bottom: number
	): void {
		const parent = <View>this.content.parent;
		const newHeight = parent.getMeasuredHeight();
		if (newHeight === this.lastHeight) {
			return;
		}

		const locationOnScreen = parent.getLocationOnScreen();
		const y =
			locationOnScreen && locationOnScreen.y ? locationOnScreen.y : 0;
		this.startPositionY =
			screen.mainScreen.heightDIPs -
			y -
			(this.showWhenKeyboardHidden === true ? newHeight : 0) /
				screen.mainScreen.scale;
		this.log("_layout, startPositionY: " + this.startPositionY);

		if (this.lastHeight === undefined) {
			// this moves the keyboardview to the bottom (just move it offscreen/toggle visibility(?) if the user doesn't want to show it without the keyboard being up)
			if (this.showWhenKeyboardHidden === true) {
				if (this.showAtBottomWhenKeyboardHidden === true) {
					parent.translateY = this.startPositionY;
				}
			} else {
				parent.translateY = this.startPositionY;
			}
		} else if (this.lastHeight !== newHeight) {
			parent.translateY = this.startPositionY;
		}
		this.lastHeight = newHeight;
	}
}
