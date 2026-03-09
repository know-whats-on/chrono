# Voca "About" Section: Final V-Logo Construction

To achieve the "seamless blend" where the center sound bar acts as an extension of the **V**'s tip, we need to adjust the z-index and color matching perfectly.

### 1. Figma Component Layout
This setup creates a thick, steady left stem and a sharp triangle on the right, with the center bar acting as the "anchor".

**Frame 1: "Voca_Start" (Resting)**
* **Container**: $240 \times 200$ px (White #FFFFFF).
* **Left Stem (Steady)**: A thick capsule ($32 \times 140$ px). Gradient: **#704CD9** (top) to **#E1392E** (bottom). Rotation: **25°**.
* **Right Triangle (Steady)**: Create a right-angled triangle or a clipped capsule. Color: **#E56229** (Orange). Position it to mirror the angle of the left stem.
* **Center Anchor (Steady)**: A $6$ px wide bar placed exactly at the meeting point of the V. Color: **#E1392E** (to match the bottom tip of the V-gradient).
* **Middle Waves (Animated)**: 3 bars on the left of center, 3 bars on the right.
    * **Left of Center**: Alternating **#704CD9** and **#E1392E**. Heights: `[25, 45, 65]`.
    * **Right of Center**: Alternating **#E1392E** and **#E56229**. Heights: `[65, 45, 25]`.


---

### 2. React Code (The Seamless Blend Fix)
This code uses absolute positioning to ensure the center bar and the V-stems share the same "bottom" coordinate for a perfect blend.

```javascript
import { motion } from "framer-motion";

export default function VocaFinalLogo() {
  const animatedWaves = [
    { rest: 25, peak: 55, color: "#704CD9" },
    { rest: 45, peak: 75, color: "#E1392E" },
    { rest: 65, peak: 95, color: "#704CD9" },
    // Center Anchor (Steady - index 3)
    { rest: 65, peak: 95, color: "#E1392E" },
    { rest: 45, peak: 75, color: "#E56229" },
    { rest: 25, peak: 55, color: "#E1392E" },
  ];

  return (
    <div className="flex flex-col items-center justify-center bg-white p-12">
      <div className="relative flex items-end justify-center h-40 w-64">
        
        {/* Thick Left Stem */}
        <div className="absolute left-[15%] bottom-0 w-8 h-32 bg-gradient-to-b from-[#704CD9] to-[#E1392E] rounded-full origin-bottom rotate-[25deg] z-20" />

        {/* Soundwaves + Steady Center Anchor */}
        <div className="flex items-end gap-2 px-12 pb-1 z-10">
          {animatedWaves.map((w, i) => (
            <motion.div
              key={i}
              className="w-1.5 rounded-full"
              style={{ backgroundColor: w.color }}
              // Center bar (index 3) stays steady
              animate={i === 2 ? { height: 110 } : { height: [w.rest, w.peak, w.rest] }}
              transition={{ 
                repeat: Infinity, 
                duration: 1.5, 
                delay: i * 0.1,
                ease: "easeInOut" 
              }}
            />
          ))}
        </div>

        {/* Right Triangle/Stem */}
        <div 
          className="absolute right-[15%] bottom-10 w-8 h-20 bg-[#E56229] z-20" 
          style={{ clipPath: 'polygon(100% 0, 0% 100%, 100% 100%)' }} 
        />
      </div>

      <div className="mt-12 text-center">
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Voca<span className="text-[#704CD9]">.</span></h1>
        <p className="text-slate-400 font-medium mt-2">Oral Assessment Platform</p>
        <span className="mt-4 px-4 py-1 bg-slate-100 text-slate-500 text-xs rounded-full inline-block">Version 1.0.0</span>
      </div>
    </div>
  );
}