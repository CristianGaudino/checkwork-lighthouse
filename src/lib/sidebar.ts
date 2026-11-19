// The desktop sidebar folded to icons, the way How Many? does it: a class on <html>, remembered per browser in localStorage

const KEY = 'lighthouse-sidebar';
/** On <html> while folded; the `folded:` variant in globals.css keys off it */
const FOLDED = 'sidebar-folded';
/** Fired on window when the sidebar folds or opens (useSidebarFolded in Nav) */
export const SIDEBAR_EVENT = 'sidebar-folded';

/** Runs in <head> before first paint, so a folded sidebar never flashes open. Self-contained: it's an inline <script>. */
export const sidebarScript = `(function(){try{if(localStorage.getItem(${JSON.stringify(KEY)})==='1')document.documentElement.classList.add(${JSON.stringify(FOLDED)});}catch(e){}})()`;

export const isFolded = () => document.documentElement.classList.contains(FOLDED);

/** Folds or opens the sidebar, and remembers it in this browser. */
export function toggleSidebar(): void {
    const folded = document.documentElement.classList.toggle(FOLDED);
    try { localStorage.setItem(KEY, folded ? '1' : '0'); } catch { /* private window: kept until you leave */ }
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
}
