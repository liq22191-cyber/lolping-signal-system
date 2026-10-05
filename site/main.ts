// Order matters: the shim must define window.overlay before the overlay renderer subscribes to it.
import '../src/renderer/overlay/overlay.css';
import './site.css';
import './overlayShim';
import '../src/renderer/overlay/main';
import { startPage } from './page';

startPage();
