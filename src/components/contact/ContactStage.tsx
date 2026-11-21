"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CONTACT_COUNT, CONTACT_MEMBERS, CONTACT_PLACEHOLDERS, CONTACT_REST_INDEX, type ContactMember } from "@/data/contactData";
import { ContactDeck, type DeckApi } from "@/components/contact/ContactDeck";
import { ContactFrame } from "@/components/contact/ContactFrame";
import { DESK_REST_GAP, PHONE_REST_GAP, scrollForMember } from "@/components/contact/deckMath";
import styles from "./contact.module.css";

const GITHUB = "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";

function pad(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function sine(width: number, height: number, cycles: number, amplitude: number, phase: number): string {
  let path = "";
  for (let x = 0; x <= width; x += 1) {
    const y = height / 2 + Math.sin((x / width) * Math.PI * 2 * cycles + phase) * amplitude * Math.sin((Math.PI * x) / width);
    path += `${x === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return path;
}

function easeOutQuart(value: number): number {
  return 1 - (1 - value) ** 4;
}

function Wave({ width, height, stroke, member }: { width: number; height: number; stroke: number; member: number | "page" }) {
  return (
    <svg className={styles.wave} data-wave={member} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path stroke="#fff3ea" strokeWidth={stroke} strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Eq({ on }: { on: boolean }) {
  const heights = [4, 9, 6, 11];
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
      {heights.map((bar, index) => (
        <line key={bar + index} x1={index * 4 + 1} y1={12 - bar} x2={index * 4 + 1} y2="12" stroke="#fff3ea" strokeOpacity={on ? 1 : 0.56} strokeWidth="2" />
      ))}
    </svg>
  );
}

function MemberIcon({ member }: { member: ContactMember }) {
  const label = member.githubIsPlaceholder ? "GitHub link placeholder" : `GitHub ${member.github}`;
  const graphic = member.icon === "github" ? (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d={GITHUB} /></svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
  const body = (
    <ContactFrame cut={8} fill="#121212" className={styles.icon}>
      {graphic}
    </ContactFrame>
  );
  if (member.githubIsPlaceholder) return <span aria-label={label}>{body}</span>;
  return <a href={`https://github.com/${member.github}`} aria-label={label} target="_blank" rel="noreferrer">{body}</a>;
}

function Mail({ member }: { member: ContactMember }) {
  if (member.emailIsPlaceholder) return <span className={styles.mail}>{member.email}</span>;
  return <a className={styles.mail} href={`mailto:${member.email}`}>{member.email}</a>;
}

export function ContactStage() {
  const stageRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLSpanElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLSpanElement>(null);
  const focusRef = useRef<HTMLSpanElement>(null);
  const githubRef = useRef<HTMLSpanElement>(null);
  const deckRef = useRef<DeckApi | null>(null);
  const [phone, setPhone] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const query = window.matchMedia("(max-width: 1100px)");
    const apply = () => setPhone(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".sonify-nav");
    const player = document.querySelector<HTMLElement>("aside[aria-label='Persistent mini-player']");
    const navVisibility = nav?.style.visibility ?? "";
    const playerVisibility = player?.style.visibility ?? "";
    if (phone && nav) {
      nav.setAttribute("inert", "");
      nav.style.visibility = "hidden";
    }
    if (player) {
      player.setAttribute("inert", "");
      player.style.visibility = "hidden";
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      nav?.removeAttribute("inert");
      if (nav) nav.style.visibility = navVisibility;
      player?.removeAttribute("inert");
      if (player) player.style.visibility = playerVisibility;
      document.body.style.overflow = previous;
    };
  }, [phone]);

  useEffect(() => {
    const stage = stageRef.current;
    const list = listRef.current;
    if (!stage || !list || !ready || !deckRef.current) return;
    const deck = deckRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stage.dataset.motion = reduced ? "reduced" : "live";
    const rows = [...list.querySelectorAll<HTMLElement>("[data-row]")];
    const gap = phone ? PHONE_REST_GAP : DESK_REST_GAP;
    const pixelsPerMember = phone ? 180 : 400;
    const rowHeight = phone ? { off: 20, on: 148, gap: 10 } : { off: 36, on: 88, gap: 14 };
    const motion = {
      c: CONTACT_REST_INDEX,
      t: CONTACT_REST_INDEX,
      prev: CONTACT_REST_INDEX,
      speed: 0,
      last: performance.now() - 1000,
      lastPaint: 0,
      time: 0,
      intro: !reduced,
      started: performance.now(),
      drag: false,
      spring: false,
      goal: CONTACT_REST_INDEX,
      vel: 0,
      swing: 0,
      swingTarget: 0,
      gap: reduced ? gap : 0,
      focus: reduced ? 1 : 0,
      active: -1,
      listY: null as number | null,
    };

    const resize = () => {
      const canvas = stage.querySelector("canvas");
      const box = canvas?.getBoundingClientRect();
      const width = box && box.width > 2 ? box.width : stage.clientWidth;
      const height = box && box.height > 2 ? box.height : stage.clientHeight;
      deck.resize(width, height, phone);
    };
    resize();

    const layout = (active: number) => {
      let y = 0;
      return rows.map((_, index) => {
        const height = index === active ? rowHeight.on : rowHeight.off;
        const placed = { y, height };
        y += height + rowHeight.gap;
        return placed;
      });
    };

    const setActive = (active: number) => {
      if (active === motion.active) return;
      motion.active = active;
      stage.dataset.active = String(active);
      const placed = layout(active);
      rows.forEach((row, index) => {
        const on = index === active;
        row.dataset.active = on ? "true" : "false";
        row.style.opacity = !phone || on ? "1" : "0.56";
        row.querySelector("button")?.setAttribute("aria-pressed", on ? "true" : "false");
        if (!phone) {
          row.style.top = `${placed[index].y}px`;
          row.style.height = `${placed[index].height}px`;
        } else {
          row.style.height = `${placed[index].height}px`;
        }
        const live = row.querySelector<HTMLElement>("[data-live]");
        if (live && phone) {
          live.classList.remove(styles.fadeIn);
          if (on) {
            void live.offsetWidth;
            live.classList.add(styles.fadeIn);
          }
        }
        const phoneRole = row.querySelector<HTMLElement>("[data-phone-role]");
        if (phoneRole) {
          phoneRole.classList.remove(styles.fadeIn);
          if (on) {
            void phoneRole.offsetWidth;
            phoneRole.classList.add(styles.fadeIn);
          }
        }
      });
      const member = CONTACT_MEMBERS[active];
      if (roleRef.current) roleRef.current.textContent = member.role;
      if (githubRef.current) {
        githubRef.current.textContent = member.github;
        githubRef.current.classList.toggle(styles.dim, member.githubIsPlaceholder);
      }
      const meta = stage.querySelector<HTMLElement>("[data-meta]");
      if (meta && !meta.dataset.shown) {
        meta.dataset.shown = "true";
        meta.classList.add(styles.fadeIn);
      }
      if (liveRef.current) {
        liveRef.current.textContent = `${member.name}, ${member.role}, ${active + 1} of ${CONTACT_COUNT}`;
      }
      if (!phone && list) {
        const total = placed[placed.length - 1].y + placed[placed.length - 1].height;
        list.style.height = `${total}px`;
        const target = stage.clientHeight / 2 - total / 2;
        if (motion.listY == null || reduced) motion.listY = target;
      }
    };

    const paint = (now: number) => {
      const dt = Math.min(0.05, (now - (motion.lastPaint || now)) / 1000);
      motion.lastPaint = now;
      motion.time = (motion.time || 0) + dt;
      if (motion.intro) {
        const progress = Math.min(1, (now - motion.started) / 2000);
        const eased = easeOutQuart(progress);
        const focusIn = Math.max(0, Math.min(1, (now - motion.started - 1060) / 1100));
        motion.gap = gap * (1 - (1 - focusIn) ** 3);
        motion.focus = 1 - (1 - focusIn) ** 3;
        motion.c = CONTACT_REST_INDEX - 24 + 24 * eased;
        motion.t = CONTACT_REST_INDEX;
        stage.querySelectorAll<HTMLElement>("[data-intro]").forEach((node, index) => {
          const local = Math.max(0, Math.min(1, (now - motion.started - 300 - index * 60) / 900));
          const shown = easeOutQuart(local);
          node.style.opacity = String(shown);
          node.style.translate = node.querySelector("[data-odo]") ? "none" : `0 ${(1 - shown) * 12}px`;
        });
        if (now - motion.started >= 2160) {
          motion.gap = gap;
          motion.focus = 1;
          motion.intro = false;
          motion.last = now - 1000;
        }
      } else if (!reduced) {
        if (motion.spring && !motion.drag) {
          const stiffness = 120;
          const damping = 22;
          motion.vel += ((motion.goal - motion.t) * stiffness - motion.vel * damping) * dt;
          motion.t += motion.vel * dt;
          motion.speed = Math.max(-0.35, Math.min(0.35, motion.vel * 0.08));
          motion.swingTarget = Math.max(-0.07, Math.min(0.07, -motion.vel * 0.012));
          if (Math.abs(motion.goal - motion.t) < 0.0015 && Math.abs(motion.vel) < 0.02) {
            motion.t = motion.goal;
            motion.vel = 0;
            motion.speed = 0;
            motion.swingTarget = 0;
            motion.spring = false;
          }
          motion.c = motion.t;
        } else {
          if (!motion.drag && now - motion.last > 140) {
            const nearest = Math.round(motion.t);
            const settle = 1 - (1 - 0.085) ** (dt * 60);
            motion.t += (nearest - motion.t) * settle;
            if (Math.abs(motion.t - nearest) < 0.0015) motion.t = nearest;
          }
          if (motion.drag) {
            motion.c = motion.t;
            if (now - motion.last > 40) {
              motion.speed *= 0.86 ** (dt * 60);
              motion.swingTarget += (0 - motion.swingTarget) * (1 - Math.exp(-dt * 8));
            }
          } else {
            const amount = 0.06;
            motion.c += (motion.t - motion.c) * (1 - (1 - amount) ** (dt * 60));
            motion.speed *= 0.86 ** (dt * 60);
          }
        }
        motion.swing += (motion.swingTarget - motion.swing) * (1 - Math.exp(-dt * 16));
        if (!motion.drag && !motion.spring && Math.abs(motion.swing) < 0.0008) motion.swing = 0;
      }
      const center = deck.draw(scrollForMember(motion.c), motion.speed, motion.gap, motion.focus, reduced ? 0 : motion.swing);
      const active = ((Math.round(motion.c) % CONTACT_COUNT) + CONTACT_COUNT) % CONTACT_COUNT;
      setActive(active);
      const roll = ((motion.c % CONTACT_COUNT) + CONTACT_COUNT) % CONTACT_COUNT + CONTACT_COUNT;
      const nearestRoll = Math.round(roll);
      const steps = Math.abs(roll - nearestRoll) < 0.004 ? nearestRoll : roll;
      stage.querySelectorAll<HTMLElement>("[data-strip]").forEach((strip) => {
        const digit = Math.round(strip.parentElement?.getBoundingClientRect().height ?? 0);
        if (digit < 2) return;
        for (const node of strip.children) {
          const glyph = node as HTMLElement;
          glyph.style.height = `${digit}px`;
          glyph.style.lineHeight = `${digit}px`;
        }
        strip.style.transform = `translateY(${-steps * digit}px)`;
      });
      if (!phone && motion.listY != null && list) {
        const placed = layout(active);
        const total = placed[placed.length - 1].y + placed[placed.length - 1].height;
        const target = stage.clientHeight / 2 - total / 2;
        motion.listY += (target - motion.listY) * (reduced ? 1 : 1 - (1 - 0.12) ** (dt * 60));
        list.style.transform = `translateY(${motion.listY.toFixed(2)}px)`;
      }
      if (aiRef.current) {
        const show = center?.member === CONTACT_COUNT - 1 && CONTACT_MEMBERS[center.member].aiGenerated;
        aiRef.current.style.opacity = show && center ? "1" : "0";
        if (show && center) aiRef.current.style.transform = `translate(${center.x.toFixed(2)}px, ${center.y.toFixed(2)}px)`;
      }
      stage.querySelectorAll<SVGPathElement>("[data-wave] path").forEach((path) => {
        const host = path.ownerSVGElement;
        if (!host) return;
        const marked = host.dataset.wave;
        const memberIndex = marked === "page" ? active : Number(marked);
        const member = CONTACT_MEMBERS[memberIndex] ?? CONTACT_MEMBERS[active];
        const width = Number(host.getAttribute("width")) || 20;
        const height = Number(host.getAttribute("height")) || 8;
        const playing = marked === "page" || memberIndex === active;
        const amplitude = (height / 2 - 1) * (playing ? 1 : 0.6) * (reduced ? 0.8 : 0.75 + 0.25 * Math.sin((motion.time || 0) * 3 + memberIndex));
        const phase = reduced ? 0 : -(motion.time || 0) * (playing ? 7 : 2.5);
        path.setAttribute("d", sine(width, height, member.wave, amplitude, phase));
      });
    };

    const reveal = () => {
      motion.intro = false;
      stage.querySelectorAll<HTMLElement>("[data-intro]").forEach((node) => {
        node.style.opacity = "1";
        node.style.translate = "none";
      });
      motion.gap = gap;
      motion.focus = 1;
    };

    const goTo = (index: number) => {
      reveal();
      motion.drag = false;
      motion.spring = false;
      motion.vel = 0;
      motion.speed = 0;
      motion.swing = 0;
      motion.swingTarget = 0;
      motion.t = index;
      motion.last = performance.now();
      if (reduced) {
        motion.c = index;
        paint(performance.now());
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (!stage.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      if (phone && list.contains(event.target as Node)) {
        stage.scrollTop += event.deltaY;
        return;
      }
      if (motion.intro) return;
      motion.spring = false;
      motion.swingTarget = 0;
      motion.t += event.deltaY / pixelsPerMember;
      motion.speed -= event.deltaY / pixelsPerMember;
      motion.last = performance.now();
      if (reduced) {
        motion.t = Math.round(motion.t);
        motion.c = motion.t;
        paint(performance.now());
      }
    };
    const canvas = stage.querySelector("canvas");
    const deckEl = canvas?.parentElement;
    const pointer = {
      id: -1,
      x: 0,
      y: 0,
      at: 0,
      origin: CONTACT_REST_INDEX,
      lock: "" as "" | "deck" | "scroll",
      velocity: 0,
      lastX: 0,
      lastY: 0,
      lastAt: 0,
    };
    const pointOf = (event: PointerEvent) => {
      const rect = canvas?.getBoundingClientRect();
      return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!canvas || !deckEl || event.button !== 0) return;
      const point = pointOf(event);
      if (!deck.hit(point.x, point.y)) return;
      reveal();
      pointer.id = event.pointerId;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      pointer.at = performance.now();
      pointer.lastAt = pointer.at;
      pointer.origin = motion.t;
      pointer.lock = "";
      pointer.velocity = 0;
      motion.spring = false;
      deckEl.dataset.grab = "hold";
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!canvas || !deckEl || event.pointerId !== pointer.id) return;
      const travelX = event.clientX - pointer.x;
      const travelY = event.clientY - pointer.y;
      if (!pointer.lock) {
        if (Math.hypot(travelX, travelY) < 6) return;
        if (phone && Math.abs(travelY) > Math.abs(travelX)) {
          pointer.lock = "scroll";
          pointer.id = -1;
          delete deckEl.dataset.grab;
          if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
          return;
        }
        pointer.lock = "deck";
        motion.drag = true;
        motion.spring = false;
        deckEl.dataset.grab = "move";
      }
      if (pointer.lock !== "deck") return;
      event.preventDefault();
      const now = performance.now();
      const step = deck.step();
      const dx = event.clientX - pointer.lastX;
      const dy = event.clientY - pointer.lastY;
      let members = 0;
      if (phone) {
        const span = Math.abs(step.x) > 24 ? step.x : (Math.sign(step.y) || 1) * -180;
        members = dx / span;
      } else {
        const length = step.x * step.x + step.y * step.y || 1;
        members = (dx * step.x + dy * step.y) / length;
      }
      motion.t += members;
      const perSecond = members / (Math.max(8, now - pointer.lastAt) / 1000);
      pointer.velocity = pointer.velocity * 0.55 + perSecond * 0.45;
      motion.speed = Math.max(-0.4, Math.min(0.4, pointer.velocity * 0.08));
      motion.swingTarget = reduced ? 0 : Math.max(-0.07, Math.min(0.07, -pointer.velocity * 0.012));
      motion.c = motion.t;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      pointer.lastAt = now;
      motion.last = now;
      if (reduced) paint(now);
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (!deckEl || (pointer.id !== -1 && event.pointerId !== pointer.id)) return;
      const locked = pointer.lock;
      pointer.id = -1;
      pointer.lock = "";
      delete deckEl.dataset.grab;
      motion.drag = false;
      if (locked !== "deck") return;
      const direction = Math.sign(pointer.velocity);
      let goal = Math.round(motion.t);
      if (Math.abs(pointer.velocity) > 0.85 && direction !== 0 && goal === Math.round(pointer.origin)) {
        goal = Math.round(pointer.origin) + direction;
      }
      motion.last = performance.now();
      if (reduced) {
        motion.t = goal;
        motion.c = goal;
        motion.speed = 0;
        motion.swing = 0;
        motion.swingTarget = 0;
        motion.spring = false;
        paint(performance.now());
        return;
      }
      motion.spring = true;
      motion.goal = goal;
      motion.vel = Math.max(-5, Math.min(5, pointer.velocity));
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      goTo((motion.active + direction + CONTACT_COUNT) % CONTACT_COUNT);
    };
    const onFocus = (event: FocusEvent) => {
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-row]");
      if (!row) return;
      goTo(Number(row.dataset.row));
    };

    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    canvas?.addEventListener("pointerdown", onPointerDown);
    canvas?.addEventListener("pointermove", onPointerMove);
    canvas?.addEventListener("pointerup", onPointerEnd);
    canvas?.addEventListener("pointercancel", onPointerEnd);
    window.addEventListener("keydown", onKey);
    stage.addEventListener("focusin", onFocus);
    window.addEventListener("resize", resize);
    let frame = 0;
    if (reduced) paint(performance.now());
    else frame = requestAnimationFrame(function loop(now: number) { paint(now); frame = requestAnimationFrame(loop); });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", onWheel, { capture: true });
      canvas?.removeEventListener("pointerdown", onPointerDown);
      canvas?.removeEventListener("pointermove", onPointerMove);
      canvas?.removeEventListener("pointerup", onPointerEnd);
      canvas?.removeEventListener("pointercancel", onPointerEnd);
      delete deckEl?.dataset.grab;
      window.removeEventListener("keydown", onKey);
      stage.removeEventListener("focusin", onFocus);
      window.removeEventListener("resize", resize);
    };
  }, [phone, ready]);

  const digits = Array.from({ length: 18 }, (_, index) => (index % CONTACT_COUNT) + 1);

  return (
    <main
      ref={stageRef}
      id="main-content"
      tabIndex={-1}
      className={styles.stage}
      data-layout={phone ? "phone" : "desk"}
      data-motion="live"
      data-active={String(CONTACT_REST_INDEX)}
      aria-label="Contact"
    >
      <ContactFrame intro cut={10} fill="#fff3ea" stroke="none" className={`${styles.nav} ${styles.chrome} ${styles.phoneOnly} ${styles.phoneNav}`}>
        <div className={styles.navLinks}>
          <span>SONIFYSPHERE</span>
          <span>MENU</span>
        </div>
      </ContactFrame>
      <ContactFrame intro cut={8} fill="none" stroke="rgba(255,243,234,0.72)" className={styles.sound}>
        <button
          type="button"
          className={styles.soundButton}
          aria-pressed={soundOn}
          onClick={() => setSoundOn((value) => !value)}
        >
          <Eq on={soundOn} />
          <span className={styles.soundLabel}>SOUND:</span>
          <span>{soundOn ? "ON" : "OFF"}</span>
        </button>
      </ContactFrame>
      <div data-intro className={styles.inquiry}>
        <span className={`${styles.kicker} ${styles.deskOnly}`}>FOR INQUIRIES</span>
        <span className={styles.placeholder}>{CONTACT_PLACEHOLDERS.inquiry}</span>
      </div>

      <div className={styles.deck}>
        <ContactDeck onReady={(api) => { deckRef.current = api; setReady(true); }} />
        <div ref={aiRef} className={styles.ai}>AI-GENERATED IMAGE</div>
      </div>

      <p data-intro className={`${styles.word} ${styles.deskOnly}`}>SONIFYSPHERE®</p>

      <div data-intro className={`${styles.leftRail} ${styles.deskOnly}`}>
      <p className={`${styles.kicker} ${styles.teamLabel}`}>TEAM</p>
      <div className={styles.indexBlock}>
        <div className={styles.odo} data-odo aria-hidden="true">
          <span className={styles.slot}><span className={styles.phantom}>0</span><span className={styles.strip}>0</span></span>
          <span className={styles.slot}>
            <span className={styles.phantom}>0</span>
            <span ref={stripRef} data-strip className={styles.strip}>
              {digits.map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)}
            </span>
          </span>
        </div>
        <span className={`${styles.kicker} ${styles.count}`}>/0{CONTACT_COUNT}</span>
      </div>
      <div data-meta className={styles.meta}>
        <div className={styles.metaRow}><span className={styles.kicker}>ROLE</span><span ref={roleRef} className={styles.metaValue}>{CONTACT_MEMBERS[CONTACT_REST_INDEX].role}</span></div>
        <div className={styles.metaRow}><span className={styles.kicker}>FOCUS</span><span ref={focusRef} className={`${styles.metaValue} ${styles.dim}`}>{CONTACT_PLACEHOLDERS.focus}</span></div>
        <div className={styles.metaRow}><span className={styles.kicker}>GITHUB</span><span ref={githubRef} className={styles.metaValue}>{CONTACT_MEMBERS[CONTACT_REST_INDEX].github}</span></div>
      </div>
      </div>
      <p data-intro className={`${styles.scrollHint} ${styles.deskOnly}`}>SCROLL</p>
      <p data-intro className={`${styles.voices} ${styles.deskOnly}`}>06 VOICES →</p>

      <div className={styles.listWrap}>
        <div data-intro className={`${styles.phoneHead} ${styles.phoneOnly}`}>
          <div className={styles.indexBlock}>
            <span className={styles.kicker}>TEAM</span>
            <div className={styles.odo} data-odo aria-hidden="true">
              <span className={styles.slot}><span className={styles.phantom}>0</span><span className={styles.strip}>0</span></span>
              <span className={styles.slot}>
                <span className={styles.phantom}>0</span>
                <span data-strip className={styles.strip}>
                  {digits.map((digit, index) => <span key={`p-${digit}-${index}`}>{digit}</span>)}
                </span>
              </span>
            </div>
            <span className={styles.kicker}>/0{CONTACT_COUNT}</span>
          </div>
          <div className={styles.voices}>
            <Wave width={28} height={12} stroke={1.25} member="page" />
            <span className={styles.placeholder}>06 VOICES →</span>
          </div>
        </div>
        <div ref={listRef} className={styles.list} role="list" aria-label="Team">
          {CONTACT_MEMBERS.map((member, index) => (
            <div key={member.name} className={styles.row} data-row={index} role="listitem" style={{ opacity: index === CONTACT_REST_INDEX ? 1 : 0.56 }} data-active={index === CONTACT_REST_INDEX ? "true" : "false"}>
              {phone ? <ContactFrame cut={12} fill="#171716" stroke="rgba(255,243,234,0.26)" className={styles.phonePanel} /> : null}
              <button type="button" className={styles.rowHit} aria-pressed={index === CONTACT_REST_INDEX} aria-label={`${member.name}, ${member.role}`}>
                <span className={`${styles.indexNo} ${styles.phoneOnly}`}>{pad(index)}</span>
                <span className={`${styles.deskIndex} ${styles.deskOnly}`}>{pad(index)}</span>
                <span data-phone-role className={`${styles.phoneRole} ${styles.phoneOnly}`}>{member.role.toUpperCase()}</span>
                <span className={`${styles.roleLine} ${styles.deskOnly}`}>{member.role.toUpperCase()}</span>
                <span className={styles.name}>{member.name}</span>
                <span className={styles.emailGhost}>{member.email}</span>
              </button>
              <div data-live className={styles.emailLive}>
                <span className={`${styles.rule} ${styles.deskOnly}`} />
                <span className={styles.emailRow}><Mail member={member} /><MemberIcon member={member} /></span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div ref={liveRef} className={styles.sr} aria-live="polite" />
    </main>
  );
}
