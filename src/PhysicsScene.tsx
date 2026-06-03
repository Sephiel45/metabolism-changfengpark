import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { PHYSICS_ITEMS, type PhysicsItemConfig } from "./physics/items";

const WALL_THICKNESS = 100;

interface BodyEntry {
  config: PhysicsItemConfig;
  body: Matter.Body;
}

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createWalls(width: number, height: number) {
  return [
    Matter.Bodies.rectangle(width / 2, height + WALL_THICKNESS / 2, width + WALL_THICKNESS * 2, WALL_THICKNESS, {
      isStatic: true,
      label: "wall-bottom",
      friction: 0.8,
      restitution: 0.3,
    }),
    Matter.Bodies.rectangle(-WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, height + WALL_THICKNESS * 2, {
      isStatic: true,
      label: "wall-left",
    }),
    Matter.Bodies.rectangle(width + WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, height + WALL_THICKNESS * 2, {
      isStatic: true,
      label: "wall-right",
    }),
  ];
}

function createDropBodies(width: number): BodyEntry[] {
  const margin = width * 0.2;
  const spawnMinX = margin;
  const spawnMaxX = width - margin;

  return PHYSICS_ITEMS.map((config) => {
    const x = randomInRange(spawnMinX, spawnMaxX);
    const y = randomInRange(-800, -200);

    const body = Matter.Bodies.rectangle(x, y, config.width, config.height, {
      label: config.id,
      restitution: 0.45,
      friction: 0.6,
      frictionAir: 0.02,
      density: 0.002,
      chamfer: { radius: 4 },
    });

    Matter.Body.setAngle(body, randomInRange(-0.4, 0.4));

    return { config, body };
  });
}

/** matter-js 在 body 上监听 wheel 并 preventDefault，会阻断页面滚动 */
function disableMouseWheelCapture(mouse: Matter.Mouse) {
  const m = mouse as Matter.Mouse & { mousewheel?: (event: Event) => void };
  if (m.element && m.mousewheel) {
    m.element.removeEventListener("wheel", m.mousewheel);
    m.element.removeEventListener("mousewheel", m.mousewheel);
    m.element.removeEventListener("DOMMouseScroll", m.mousewheel);
  }
}

export function PhysicsScene() {
  const domRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const runnerRef = useRef<Matter.Runner | null>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const mouseConstraintRef = useRef<Matter.MouseConstraint | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isHomeVisible, setIsHomeVisible] = useState(true);

  useEffect(() => {
    const home = document.getElementById("home");
    if (!home) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHomeVisible(entry.isIntersecting && entry.intersectionRatio > 0.2);
      },
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    );

    observer.observe(home);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const runner = runnerRef.current;
    const engine = engineRef.current;
    const mouseConstraint = mouseConstraintRef.current;
    if (!runner || !engine) return;

    if (isHomeVisible) {
      Matter.Runner.run(runner, engine);
    } else {
      Matter.Runner.stop(runner);
      setDraggingId(null);
      if (mouseConstraint) {
        mouseConstraint.body = null;
      }
    }
  }, [isHomeVisible]);

  useEffect(() => {
    const { Engine, Runner, Composite, Mouse, MouseConstraint, Events } = Matter;

    const engine = Engine.create({
      gravity: { x: 0, y: 0.8, scale: 0.001 },
    });

    const runner = Runner.create();
    Runner.run(runner, engine);
    engineRef.current = engine;
    runnerRef.current = runner;

    const width = window.innerWidth;
    const height = window.innerHeight;

    let walls = createWalls(width, height);
    const entries = createDropBodies(width);

    Composite.add(engine.world, [...walls, ...entries.map((e) => e.body)]);

    const mouse = Mouse.create(document.body);
    mouse.pixelRatio = window.devicePixelRatio || 1;
    disableMouseWheelCapture(mouse);

    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: 0.25,
        damping: 0.05,
        render: { visible: false },
      },
    });
    mouseConstraintRef.current = mouseConstraint;

    Composite.add(engine.world, mouseConstraint);

    const syncDom = () => {
      for (const { config, body } of entries) {
        const el = domRefs.current.get(config.id);
        if (!el) continue;

        const { x, y } = body.position;
        el.style.transform = `translate(${x - config.width / 2}px, ${y - config.height / 2}px) rotate(${body.angle}rad)`;
      }
    };

    Events.on(engine, "afterUpdate", syncDom);

    Events.on(mouseConstraint, "startdrag", (event: Matter.IEvent<Matter.MouseConstraint> & { body?: Matter.Body }) => {
      const body = event.body;
      if (body?.label && !body.label.startsWith("wall-")) {
        setDraggingId(body.label);
      }
    });

    Events.on(mouseConstraint, "enddrag", () => {
      setDraggingId(null);
    });

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      Composite.remove(engine.world, walls);
      walls = createWalls(w, h);
      Composite.add(engine.world, walls);
    };

    window.addEventListener("resize", handleResize);

    syncDom();

    return () => {
      window.removeEventListener("resize", handleResize);
      Events.off(engine, "afterUpdate", syncDom);
      Events.off(mouseConstraint, "startdrag");
      Events.off(mouseConstraint, "enddrag");
      Runner.stop(runner);
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      engineRef.current = null;
      runnerRef.current = null;
      mouseConstraintRef.current = null;
      if (mouse.element) {
        Mouse.clearSourceEvents(mouse);
      }
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-10 transition-opacity duration-300 ${
        isHomeVisible ? "opacity-100" : "opacity-0 invisible"
      }`}
      aria-hidden={!isHomeVisible}
    >
      {PHYSICS_ITEMS.map((item) => (
        <div
          key={item.id}
          ref={(el) => {
            if (el) domRefs.current.set(item.id, el);
            else domRefs.current.delete(item.id);
          }}
          className={`absolute left-0 top-0 will-change-transform select-none touch-none ${
            isHomeVisible ? "pointer-events-auto" : "pointer-events-none"
          } ${draggingId === item.id ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ width: item.width, height: item.height }}
        >
          <img
            src={item.image}
            alt=""
            draggable={false}
            className="h-full w-full object-contain drop-shadow-lg pointer-events-none"
            onError={(e) => {
              e.currentTarget.style.opacity = "0.35";
              e.currentTarget.alt = item.id;
            }}
          />
        </div>
      ))}
    </div>
  );
}
