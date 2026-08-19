/* Pages Function: serves /api/* on the SAME ORIGIN as the page.
 *
 * The client's api() uses relative paths, so the proxy has to live on this origin - and a
 * *.pages.dev domain cannot carry a Worker route (those need a zone), which leaves Pages Functions
 * as the only way to get there.
 *
 * This is deliberately a four-line adapter that IMPORTS the Worker rather than a copy of it. There
 * are already three implementations of the Yahoo client in this repo (server.py, the native JS
 * client, and worker/src/index.js) and two of them have drifted apart twice - the crumb validator
 * and the concurrency cap both had to be fixed in one place and then again in another. A fourth
 * copy would be a fourth thing to forget.
 */
import worker from "../../worker/src/index.js";

export const onRequest = (context) => worker.fetch(context.request);
