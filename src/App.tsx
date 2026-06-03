import { useEffect, useRef, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { SkipBack, SkipForward } from "lucide-react";
import { MapScanSection } from "./MapScanSection";
import { PlyViewer } from "./PlyViewer";
import { PhysicsScene } from "./PhysicsScene";

const NAV_LINKS = [
  { label: "HOME", href: "#home" },
  { label: "HISTORY", href: "#intro" },
  { label: "MAP", href: "#traces" },
  { label: "INTERVIEW", href: "#interview" },
];

let globalMouseX = -1000;
let globalMouseY = -1000;
let isHoveringText = false;

export default function App() {
  const [mounted, setMounted] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const handlePointerMove = (e: PointerEvent) => {
      globalMouseX = e.clientX;
      globalMouseY = e.clientY;
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#111] text-[#eee] w-full overflow-clip selection:bg-white selection:text-black">
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="gooey-outline" x="-40%" y="-40%" width="180%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" xChannelSelector="R" yChannelSelector="G" result="wobbly" />
            <feColorMatrix in="noise" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -14" result="holes" />
            <feComposite in="wobbly" in2="holes" operator="out" result="spongy" />
            <feGaussianBlur in="spongy" stdDeviation="4.5" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11" result="goo" />
            <feMorphology in="goo" operator="dilate" radius="3" result="dilated" />
            <feComposite in="dilated" in2="goo" operator="out" result="outlined" />
          </filter>
          <filter id="gooey-solid" x="-40%" y="-40%" width="180%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" xChannelSelector="R" yChannelSelector="G" result="wobbly" />
            <feColorMatrix in="noise" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -14" result="holes" />
            <feComposite in="wobbly" in2="holes" operator="out" result="spongy" />
            <feGaussianBlur in="spongy" stdDeviation="4.5" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11" result="goo" />
          </filter>
        </defs>
      </svg>

      <Navbar onBeforeNavigate={() => setSelectedInterview(null)} />

      <main className="font-serif">
        <section id="home" className="relative h-screen w-full flex items-center justify-center overflow-hidden bg-white">
          <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none w-full h-full">
            <InteractiveTitle />
          </div>
        </section>

        <HistoryScrollSection />

        <MapScanSection />

        <section id="interview" className="relative w-full bg-white text-black min-h-screen py-24 flex flex-col items-center justify-center overflow-hidden border-none font-serif">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: false }}
            transition={{ duration: 0.8 }}
            className={`relative z-20 transition-all duration-700 overflow-hidden flex justify-center items-center ${selectedInterview ? "h-0 opacity-0 mb-0 mt-0" : "h-24 opacity-100 mb-8 mt-12"}`}
          >
            <h2 className="font-sans font-semibold text-3xl md:text-4xl lg:text-5xl text-[#9a9a9a] text-center leading-none tracking-wide uppercase pointer-events-none drop-shadow-sm">
              INTERVIEW
            </h2>
          </motion.div>

          <div className={`relative w-full flex flex-col md:flex-row transition-all duration-700 ease-in-out ${selectedInterview ? "max-w-none items-stretch gap-0 px-0 absolute inset-0 z-50 h-screen bg-white" : "max-w-4xl justify-center items-center px-0"}`}>
            <div className={`transition-all duration-700 ease-in-out relative flex items-center justify-center ${selectedInterview ? "w-full md:w-[60%] h-full" : "w-full aspect-[4/3] md:aspect-[16/9]"}`}>
              <PlyViewer url="/Flor2.ply" onPointClick={setSelectedInterview} hideHotspots={!!selectedInterview} />

              {!selectedInterview && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 px-6 py-2 rounded-full border border-black/20 bg-white/60 backdrop-blur-md shadow-sm pointer-events-none">
                  <span className="font-mono text-[11px] md:text-xs text-gray-500 tracking-wide whitespace-nowrap">
                    Click the glowing points on the scan to read a trace.
                  </span>
                </div>
              )}
            </div>

            {selectedInterview && (
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-full md:w-[40%] p-6 md:p-12 flex flex-col justify-center self-center md:mt-0 h-full overflow-y-auto"
              >
                <button
                  onClick={() => setSelectedInterview(null)}
                  className="absolute top-8 right-8 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 transition-colors"
                >
                  <span className="text-xl leading-none">&times;</span>
                </button>

                <div className="relative w-full mb-6 bg-gray-100 rounded overflow-hidden aspect-[16/9] group flex items-center justify-center">
                  <video
                    src="https://www.w3schools.com/html/mov_bbb.mp4"
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                    controls
                    playsInline
                    muted
                  />
                </div>
                <h3 className="font-sans font-normal text-xl lg:text-2xl text-gray-500 mb-8 leading-snug tracking-[0.12em] uppercase max-w-prose">
                  What did you feel or imagine when you saw this trace?
                </h3>
                <p className="font-serif text-gray-600 text-sm md:text-base leading-loose tracking-wide max-w-prose mb-0 border-l border-gray-300/80 pl-5 py-2 italic">
                  A: &quot;I pictured someone trying to peel the sticker off in secret, maybe getting halfway through and then giving up. Maybe they got nervous someone was watching, or it turned out to be way harder to remove than they thought. Now it just sits there, half gone, looking like a failed mission. That kind of hesitation feels weirdly relatable.&quot; <br /><br />
                  —Trace Reader {selectedInterview}
                </p>
              </motion.div>
            )}
          </div>
        </section>
      </main>

      <PhysicsScene />
    </div>
  );
}

const SECTION_IDS = NAV_LINKS.map((link) => link.href.replace("#", ""));

function Navbar({ onBeforeNavigate }: { onBeforeNavigate?: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!mostVisible) return;
        const index = SECTION_IDS.indexOf(mostVisible.target.id);
        if (index >= 0) setActiveIndex(index);
      },
      { root: null, rootMargin: "-42% 0px -42% 0px", threshold: [0, 0.15, 0.35, 0.55, 0.75] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (index: number) => {
    const nextIndex = Math.max(0, Math.min(SECTION_IDS.length - 1, index));
    const target = document.getElementById(SECTION_IDS[nextIndex]);
    if (!target) return;
    onBeforeNavigate?.();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveIndex(nextIndex);
  };

  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < SECTION_IDS.length - 1;

  return (
    <motion.nav
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="fixed top-5 left-6 right-6 z-[100] flex items-center justify-between pointer-events-none mix-blend-difference md:top-6 md:left-10 md:right-10"
    >
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3 pointer-events-auto md:gap-x-9">
        {NAV_LINKS.map((link, index) => (
          <a
            key={link.label}
            href={link.href}
            className={`nav-link ${activeIndex === index ? "text-white/95" : ""}`}
            aria-current={activeIndex === index ? "page" : undefined}
            onClick={() => {
              onBeforeNavigate?.();
              setActiveIndex(index);
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-3 pointer-events-auto">
        <button
          type="button"
          className="nav-control-btn"
          aria-label="上一页"
          disabled={!canGoPrev}
          onClick={() => scrollToSection(activeIndex - 1)}
        >
          <SkipBack size={13} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="nav-control-btn"
          aria-label="下一页"
          disabled={!canGoNext}
          onClick={() => scrollToSection(activeIndex + 1)}
        >
          <SkipForward size={13} strokeWidth={1.5} />
        </button>
      </div>
    </motion.nav>
  );
}

function InteractiveTitle() {
  const spreadXRaw = useMotionValue(0);
  const spreadYRaw = useMotionValue(0);
  const globalSpreadX = useSpring(spreadXRaw, { stiffness: 60, damping: 18 });
  const globalSpreadY = useSpring(spreadYRaw, { stiffness: 60, damping: 18 });

  useAnimationFrame(() => {
    if (globalMouseX < 0 || globalMouseY < 0) return;
    const nx = globalMouseX / window.innerWidth;
    const ny = globalMouseY / window.innerHeight;
    spreadXRaw.set(nx * 55 - 15);
    spreadYRaw.set((1 - ny) * 55 - 10);
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, delay: 0.2 }}
      className="text-black font-zh font-black text-[3.5rem] md:text-[6.5rem] lg:text-[9.5rem] text-center leading-[0.8] tracking-tight pointer-events-auto cursor-crosshair flex flex-col items-center select-none"
      style={{ filter: "url(#gooey-outline)" }}
      onPointerEnter={() => {
        isHoveringText = true;
      }}
      onPointerLeave={() => {
        isHoveringText = false;
      }}
    >
      <FluidLine text="逛长风公园" lineIndex={0} totalLines={3} globalSpreadX={globalSpreadX} globalSpreadY={globalSpreadY} />
      <FluidLine text="或许" lineIndex={1} totalLines={3} globalSpreadX={globalSpreadX} globalSpreadY={globalSpreadY} />
      <div className="relative flex justify-center whitespace-nowrap">
        <FluidLine text="是件正经事" lineIndex={2} totalLines={3} globalSpreadX={globalSpreadX} globalSpreadY={globalSpreadY} />
        <div className="absolute left-full top-0 h-full flex items-center">
          <FluidChar char="？" globalSpreadX={globalSpreadX} charIndex={5} totalChars={5} />
        </div>
      </div>
    </motion.div>
  );
}

function FluidLine({
  text,
  lineIndex,
  totalLines,
  globalSpreadX,
  globalSpreadY,
}: {
  text: string;
  lineIndex: number;
  totalLines: number;
  globalSpreadX: ReturnType<typeof useSpring>;
  globalSpreadY: ReturnType<typeof useSpring>;
}) {
  const lineOffset = lineIndex - (totalLines - 1) / 2;
  const y = useTransform(() => globalSpreadY.get() * lineOffset);

  return (
    <motion.div style={{ y, zIndex: totalLines - lineIndex }} className="relative flex justify-center whitespace-nowrap">
      {text.split("").map((char, charIndex) => (
        <FluidChar
          key={charIndex}
          char={char}
          globalSpreadX={globalSpreadX}
          charIndex={charIndex}
          totalChars={text.length}
        />
      ))}
    </motion.div>
  );
}

function FluidChar({
  char,
  globalSpreadX,
  charIndex,
  totalChars,
}: {
  char: string;
  globalSpreadX?: ReturnType<typeof useSpring>;
  charIndex?: number;
  totalChars?: number;
  key?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const scaleRaw = useMotionValue(1);
  const localX = useMotionValue(0);
  const localY = useMotionValue(0);
  const scale = useSpring(scaleRaw, { stiffness: 180, damping: 12 });
  const x = useSpring(localX, { stiffness: 180, damping: 15 });
  const y = useSpring(localY, { stiffness: 180, damping: 15 });

  const charOffset = charIndex !== undefined && totalChars !== undefined ? charIndex - (totalChars - 1) / 2 : 0;
  const combinedX = useTransform(() => (globalSpreadX ? globalSpreadX.get() * charOffset : 0) + x.get());

  useAnimationFrame(() => {
    if (!ref.current) return;

    if (!isHoveringText) {
      scaleRaw.set(1);
      localX.set(0);
      localY.set(0);
      return;
    }

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = globalMouseX - centerX;
    const dy = globalMouseY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const radius = 240;

    if (distance < radius) {
      const t = 1 - distance / radius;
      const influence = Math.pow(t, 1.8);
      scaleRaw.set(1 + influence * 1.15);
      localX.set(dx * influence * 0.18);
      localY.set(dy * influence * 0.18);
    } else {
      scaleRaw.set(1);
      localX.set(0);
      localY.set(0);
    }
  });

  return (
    <motion.span
      ref={ref}
      style={{ scale, x: combinedX, y }}
      className="inline-block relative origin-center px-[0.02em]"
    >
      {char}
    </motion.span>
  );
}

function HistoryScrollSection() {
  const containerRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const bgScale = useTransform(scrollYProgress, [0, 0.1, 0.25], [1, 1, 1.1]);
  const bgOpacity = useTransform(scrollYProgress, [0, 0.1, 0.25], [1, 1, 0.3]);
  const titleScale = useTransform(scrollYProgress, [0, 0.1, 0.25, 0.45, 0.55], [10, 10, 1, 1, 0.95]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.1, 0.2, 0.45, 0.55], [0, 0, 1, 1, 0]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.22, 0.38, 0.55, 0.65], [0, 0, 1, 1, 0]);
  const contentY = useTransform(scrollYProgress, [0, 0.22, 0.38], [40, 40, 0]);

  return (
    <section ref={containerRef} id="intro" className="relative w-full h-[450vh] bg-[#050505] z-30 font-serif">
      <div className="absolute top-0 left-0 w-full h-[25vh] bg-gradient-to-b from-[#050505] to-transparent z-40 pointer-events-none" />

      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col items-center justify-center">
        <motion.div
          className="absolute inset-0 z-0 w-full h-full pointer-events-none"
          style={{ scale: bgScale, opacity: bgOpacity }}
        >
          <img
            src="/park.png"
            alt="Park Background"
            className="w-full h-full object-cover grayscale-0 sepia-[0.3]"
            onError={(e) => {
              e.currentTarget.src =
                "https://images.unsplash.com/photo-1582274528604-03a0889f41b2?q=80&w=2500&auto=format&fit=crop";
            }}
          />
        </motion.div>

        <div className="archive-overlay z-[5]" aria-hidden />

        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-4 md:px-8">
          <motion.header
            style={{ scale: titleScale, opacity: titleOpacity }}
            className="archive-heading absolute top-[12%] md:top-[10%] w-full text-center select-none pointer-events-none"
          >
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-[2.4rem]">
              THE HISTORY OF <br className="hidden md:block" /> CHANGFENG PARK
            </h2>
            <p className="mt-4 font-mono text-[9px] tracking-[0.35em] text-white/35 uppercase">
              Changfeng Park · Local Archive
            </p>
          </motion.header>

          <motion.article
            style={{ opacity: contentOpacity, y: contentY }}
            className="vertical-archive-wrap mt-16 md:mt-20"
          >
            <h3 className="vertical-archive-title">长风公园地方档案</h3>

            <div className="vertical-archive-text">
              <p className="vertical-archive-para">
                庾仲初《扬都赋注》曰：今太湖东注为松江，下七十里有水口分流，东北入海为娄江，东南入海为东江，与松江而三也。此山去太湖三十余里，东则松江出焉，上承太湖，东迳笠泽，在吴南松江左右也。
              </p>
              <p className="vertical-archive-para">
                庾仲初在《扬都赋注》中说：现在太湖的东面出水形成松江，往下流七十里处有分水口，分出两条支流：一条往东北流入海，叫娄江；另一条往东南入海，叫东江。这三条河流（松江、娄江、东江）一起汇称为「三江」。
              </p>
              <p className="vertical-archive-para">
                太湖东南三十多里有一座山，山的东边正是松江的源头。松江上承太湖之水，东流经过笠泽（即今江苏吴江、苏州间的泽地），流经吴地南部两岸。
              </p>
              <p className="vertical-archive-para">
                「松江」在此语境中确实是太湖东出的主流，属于「吴淞江系」。而现代的苏州河正是吴淞江下游的主要支流之一，是苏州河的古源系统。
              </p>
              <p className="vertical-archive-para">
                公园的前身是纵横交错的河网（宋家滩），后被工业污染和填埋。文化记忆、人与环境的冲突与塑造。
              </p>
              <p className="vertical-archive-para">
                1956年的大规模集体劳动，群众填山造湖，建造了今日的银锄湖、铁臂山、黑松山。
              </p>
              <p className="vertical-archive-para">
                在上世纪五十年代出现的如此规模的集体劳动在当下好像是难以复现的，反映了过渡时期工业化的生产模式。而在当下的语境中，我们是否能用一种更轻柔、干预更小的、与自然对话的模式构建劳动叙事。
              </p>
            </div>
          </motion.article>
        </div>
      </div>
    </section>
  );
}
