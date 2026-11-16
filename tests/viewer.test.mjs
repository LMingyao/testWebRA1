import test from "node:test";
import assert from "node:assert/strict";
import { onSwipe } from "../app/viewer.js";

test("only completed horizontal single-finger gestures advance the photograph", () => {
  const target = new EventTarget(), directions = [];
  onSwipe(target, direction => directions.push(direction));
  function touch(type, x, y, fingers) {
    const event = new Event(type);
    Object.defineProperties(event, {
      touches: { value: Array.from({ length: fingers }, () => ({ clientX: x, clientY: y })) },
      changedTouches: { value: [{ clientX: x, clientY: y }] },
    });
    target.dispatchEvent(event);
  }
  touch("touchstart", 200, 100, 1);
  touch("touchend", 80, 105, 0);
  touch("touchstart", 100, 100, 1);
  touch("touchend", 105, 250, 0);
  touch("touchstart", 200, 100, 1);
  touch("touchstart", 200, 100, 2);
  touch("touchend", 80, 100, 1);
  touch("touchend", 70, 100, 0);
  touch("touchstart", 200, 100, 1);
  target.dispatchEvent(new Event("touchcancel"));
  touch("touchend", 80, 100, 0);
  touch("touchstart", 80, 100, 1);
  touch("touchend", 200, 105, 0);
  assert.deepEqual(directions, [1, -1]);
});

test("short phone swipes consume the tap, while taps and vertical starts remain native", () => {
  const target = new EventTarget();
  Object.defineProperty(target, "clientWidth", { value: 320 });
  const directions = [];
  onSwipe(target, direction => directions.push(direction));
  function send(type, x, y) {
    const point = { identifier: 7, clientX: x, clientY: y };
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, {
      touches: { value: type === "touchend" ? [] : [point] },
      changedTouches: { value: [point] },
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }
  send("touchstart", 180, 80);
  send("touchmove", 161, 81);
  assert.equal(send("touchend", 133, 82), true);
  send("touchstart", 180, 80);
  assert.equal(send("touchend", 182, 81), false);
  send("touchstart", 180, 80);
  send("touchmove", 177, 99);
  assert.equal(send("touchend", 265, 107), false);
  assert.deepEqual(directions, [1]);
});
