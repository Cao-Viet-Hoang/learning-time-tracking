/* Shared fixtures: a signed-in user on the local (in-memory) backend. */

import { flush } from "./setup.js";
import { connect, disconnect } from "../../js/data/db.js";
import { setState } from "../../js/state.js";

export { flush };

let counter = 0;

/** Connects a fresh user so every test starts with empty collections. */
export async function signInFresh() {
  const user = { id: `test-user-${++counter}`, username: "Tester", mode: "local" };
  await connect({ mode: "local", user });
  setState({ user, timer: null });
  await flush();
  return user;
}

export async function signOutTest() {
  await disconnect();
  setState({ user: null, timer: null });
  await flush();
}
