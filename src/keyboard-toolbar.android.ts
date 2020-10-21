import { android as AndroidApp } from "tns-core-modules/application";
import { screen } from "tns-core-modules/platform";
import { View } from "tns-core-modules/ui/core/view";
import { Frame } from "@nativescript/core";
import { AnimationCurve } from "tns-core-modules/ui/enums";
import { Page } from "tns-core-modules/ui/page";
import { TabView } from "tns-core-modules/ui/tab-view";
import { ad } from "tns-core-modules/utils/utils";
import { ToolbarBase } from "./keyboard-toolbar.common";

const ATTEMPT_TIMES = 10;
const WAIT_FOR_INIT_POSITION = 100; // ms

export class Toolbar extends ToolbarBase {
	private startPositionY: number;
	private lastHeight: number;
	private navbarHeight: number;
	private navbarHeightWhenKeyboardOpen: number;
	private isNavbarVisible: boolean;
	private lastKeyboardHeight: number;
	private onGlobalLayoutListener: android.view.ViewTreeObserver.OnGlobalLayoutListener;
	private thePage: any;
	private static supportVirtualKeyboardCheck;

	// private onScrollChangedListener: android.view.ViewTreeObserver.OnScrollChangedListener;

	constructor() {
		super();

		this.verticalAlignment = "top"; // weird but true
	}

	private getViewForId(attemptsLeft: number): Promise<View> {
		return new Promise<View>((resolve, reject) => {
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
					this.thePage = pg;
					const forView = <View>this.thePage.getViewById(this.forId);

					if (forView) {
						resolve(forView);
					} else {
						this.getViewForId(attemptsLeft)
							.then(resolve)
							.catch(reject);
					}
				}, attemptsLeft * 15);
			} else {
				reject();
			}
		});
	}

	protected _loaded(): void {
		setTimeout(() => this.applyInitialPosition(), WAIT_FOR_INIT_POSITION);

		const onViewForIdFound = (forView: View) => {
			forView.notify({
				eventName: Toolbar.viewFoundedEvent,
				object: forView,
			});
			forView.on("focus", () => {
				this.hasFocus = true;

				setTimeout(() => {
					if (that.lastKeyboardHeight) {
						console.log(
							"forView focus, forView focus, forView focus, forView focus, forView focus"
						);
						this.showToolbar(<View>this.content.parent);
					}
				}, 100);
			});

			forView.on("blur", () => {
				this.hasFocus = false;
				setTimeout(() => {
					this.hideToolbar(<View>this.content.parent);
				}, 0);
			});
		};

		this.getViewForId(ATTEMPT_TIMES)
			.then((view) => onViewForIdFound(view))
			.catch(() =>
				console.log(
					`\n⌨ ⌨ ⌨ Please make sure forId="<view id>" resolves to a visible view, or the toolbar won't render correctly! Example: <Toolbar forId="${
						this.forId || "myId"
					}" height="44">\n\n`
				)
			);

		const that = this;

		this.onGlobalLayoutListener = new android.view.ViewTreeObserver.OnGlobalLayoutListener(
			{
				onGlobalLayout(): void {
					if (!that.content.android) {
						return;
					}
					const rect = new android.graphics.Rect();
					that.content.android.getWindowVisibleDisplayFrame(rect);

					const newKeyboardHeight =
						(Toolbar.getUsableScreenSizeY() - rect.bottom) /
						screen.mainScreen.scale;

					if (
						newKeyboardHeight <= 0 &&
						that.lastKeyboardHeight === undefined
					) {
						return;
					}

					if (newKeyboardHeight === that.lastKeyboardHeight) {
						return;
					}

					// TODO see if orientation needs to be accounted for: https://github.com/siebeprojects/samples-keyboardheight/blob/c6f8aded59447748266515afeb9c54cf8e666610/app/src/main/java/com/siebeprojects/samples/keyboardheight/KeyboardHeightProvider.java#L163
					that.lastKeyboardHeight = newKeyboardHeight;
					if (that.hasFocus) {
						if (newKeyboardHeight <= 0) {
							that.hideToolbar(that.content.parent);
						} else {
							that.showToolbar(that.content.parent);
						}
					}
				},
			}
		);

		that.content.android
			.getViewTreeObserver()
			.addOnGlobalLayoutListener(that.onGlobalLayoutListener);
		// that.content.android.getViewTreeObserver().addOnScrollChangedListener(that.onScrollChangedListener);
	}

	protected _unloaded(): void {
		this.content.android
			.getViewTreeObserver()
			.removeOnGlobalLayoutListener(this.onGlobalLayoutListener);
		// this.content.android.getViewTreeObserver().removeOnScrollChangedListener(this.onScrollChangedListener);
		this.onGlobalLayoutListener = undefined;
		// this.onScrollChangedListener = undefined;
	}

	private showToolbar(parent): void {
		let navbarHeight = this.isNavbarVisible ? 0 : this.navbarHeight;

		// some devices (Samsung S8) with a hidden virtual navbar show the navbar when the keyboard is open, so subtract its height
		if (!this.isNavbarVisible) {
			const isNavbarVisibleWhenKeyboardOpen =
				this.thePage.getMeasuredHeight() <
					Toolbar.getUsableScreenSizeY() &&
				(Toolbar.isVirtualNavbarHidden_butShowsWhenKeyboardIsOpen() ||
					Toolbar.hasPermanentMenuKey());
			if (isNavbarVisibleWhenKeyboardOpen) {
				// caching for (very minor) performance reasons
				if (!this.navbarHeightWhenKeyboardOpen) {
					this.navbarHeightWhenKeyboardOpen = Toolbar.getNavbarHeightWhenKeyboardOpen();
				}
				navbarHeight = this.navbarHeightWhenKeyboardOpen;
			}
		}

		const animateToY =
			this.startPositionY -
			this.lastKeyboardHeight -
			(this.showWhenKeyboardHidden === true
				? 0
				: this.lastHeight / screen.mainScreen.scale) -
			navbarHeight;

		parent
			.animate({
				translate: { x: 0, y: animateToY },
				curve: AnimationCurve.cubicBezier(0.32, 0.49, 0.56, 1),
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
	}

	private hideToolbar(parent): void {
		const animateToY =
			this.showWhenKeyboardHidden === true &&
			this.showAtBottomWhenKeyboardHidden !== true
				? 0
				: this.startPositionY + this.navbarHeight;

		parent
			.animate({
				translate: { x: 0, y: animateToY },
				curve: AnimationCurve.cubicBezier(0.32, 0.49, 0.56, 1), // perhaps make this one a little different as it's the same as the 'show' animation
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
	}

	private applyInitialPosition(): void {
		if (this.startPositionY !== undefined) {
			return;
		}

		const parent = <View>this.content.parent;

		// at this point, topmost().currentPage is null, so do it like this:
		this.thePage = parent;
		while (!this.thePage && !this.thePage.frame) {
			this.thePage = this.thePage.parent;
		}

		const loc = parent.getLocationOnScreen();
		if (!loc) {
			return;
		}
		const y = loc.y;
		const newHeight = parent.getMeasuredHeight();

		// this is the bottom navbar - which may be hidden by the user.. so figure out its actual height
		this.navbarHeight = Toolbar.getNavbarHeight();
		this.isNavbarVisible = !!this.navbarHeight;

		this.startPositionY =
			screen.mainScreen.heightDIPs -
			y -
			(this.showWhenKeyboardHidden === true ? newHeight : 0) /
				screen.mainScreen.scale -
			(this.isNavbarVisible ? this.navbarHeight : 0);

		if (this.lastHeight === undefined) {
			// this moves the keyboardview to the bottom (just move it offscreen/toggle visibility(?) if the user doesn't want to show it without the keyboard being up)
			if (this.showWhenKeyboardHidden === true) {
				if (this.showAtBottomWhenKeyboardHidden === true) {
					parent.translateY = this.startPositionY;
				}
			} else {
				parent.translateY = this.startPositionY + this.navbarHeight;
			}
		} else if (this.lastHeight !== newHeight) {
			parent.translateY = this.startPositionY + this.navbarHeight;
		}
		this.lastHeight = newHeight;
	}

	private static getNavbarHeight() {
		// detect correct height from: https://shiv19.com/how-to-get-android-navbar-height-nativescript-vanilla/
		const context = <android.content.Context>ad.getApplicationContext();
		let navBarHeight = 0;
		let windowManager = context.getSystemService(
			android.content.Context.WINDOW_SERVICE
		);
		let d = windowManager.getDefaultDisplay();

		let realDisplayMetrics = new android.util.DisplayMetrics();
		d.getRealMetrics(realDisplayMetrics);

		let realHeight = realDisplayMetrics.heightPixels;
		let realWidth = realDisplayMetrics.widthPixels;

		let displayMetrics = new android.util.DisplayMetrics();
		d.getMetrics(displayMetrics);

		let displayHeight = displayMetrics.heightPixels;
		let displayWidth = displayMetrics.widthPixels;

		if (realHeight - displayHeight > 0) {
			// Portrait
			navBarHeight = realHeight - displayHeight;
		} else if (realWidth - displayWidth > 0) {
			// Landscape
			navBarHeight = realWidth - displayWidth;
		}

		// Convert to device independent pixels and return
		return (
			navBarHeight / context.getResources().getDisplayMetrics().density
		);
	}

	private static getNavbarHeightWhenKeyboardOpen() {
		const resources = (<android.content.Context>(
			ad.getApplicationContext()
		)).getResources();
		const resourceId = resources.getIdentifier(
			"navigation_bar_height",
			"dimen",
			"android"
		);
		if (resourceId > 0) {
			return (
				resources.getDimensionPixelSize(resourceId) /
				screen.mainScreen.scale
			);
		}
		return 0;
	}

	private static hasPermanentMenuKey() {
		return android.view.ViewConfiguration.get(
			<android.content.Context>ad.getApplicationContext()
		).hasPermanentMenuKey();
	}

	private static isVirtualNavbarHidden_butShowsWhenKeyboardIsOpen(): boolean {
		if (Toolbar.supportVirtualKeyboardCheck !== undefined) {
			return Toolbar.supportVirtualKeyboardCheck;
		}
		const SAMSUNG_NAVIGATION_EVENT = "navigationbar_hide_bar_enabled";
		try {
			// eventId is 1 in case the virtual navbar is hidden (but it shows when the keyboard opens)
			Toolbar.supportVirtualKeyboardCheck =
				android.provider.Settings.Global.getInt(
					AndroidApp.foregroundActivity.getContentResolver(),
					SAMSUNG_NAVIGATION_EVENT
				) === 1;
		} catch (e) {
			// non-Samsung devices throw a 'SettingNotFoundException'
			console.log(">> e: " + e);
			Toolbar.supportVirtualKeyboardCheck = false;
		}
		return Toolbar.supportVirtualKeyboardCheck;
	}

	private static getUsableScreenSizeY(): number {
		const screenSize = new android.graphics.Point();
		AndroidApp.foregroundActivity
			.getWindowManager()
			.getDefaultDisplay()
			.getSize(screenSize);
		return screenSize.y;
	}
}
