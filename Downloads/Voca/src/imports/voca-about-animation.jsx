# Voca "About" Section: Animation & Figma Guide

To fix the alignment so the middle soundwaves sit perfectly between the angled stems to form the **V** shape, you need to remove the horizontal translation and use a flex container to group them correctly.

---

### 1. Figma Implementation Guide
This setup creates a single cohesive component where the bars grow from the center of the **V**.

**Frame 1: "Voca_Start" (Resting)**
* **Layout**: Create a **Frame** ($200 \times 120$ px) with Auto Layout (Horizontal, Gap: $10$ px, Alignment: Bottom).
* **Left Stem**: Capsule ($10 \times 100$ px). Gradient: **#704CD9** (Top) to **#E1392E** (Bottom). Rotation: **20°**.
* **Middle Waves (x5)**: Capsules ($6$ px wide). Alternate colors **#704CD9** and **#E56229**.
    * **Heights**: `[20, 40, 60, 40, 20]` px.
* **Right Stem**: Capsule ($10 \times 100$ px). Gradient: **#E1392E** (Top) to **#E56229** (Bottom). Rotation: **-20°**.

**Frame 2: "Voca_Peak" (Pulse)**
* Duplicate the frame. Keep the stems and gap exactly the same.
* **Update Middle Wave Heights**:
    * **Heights**: `[50, 70, 100, 70, 50]` px.

**Prototype Interaction**
* **Trigger**: `After Delay (1ms)` -> `Smart Animate` -> `Ease In and Out (600ms)`.
* **Loop**: Link Frame 2 back to Frame 1 with the same settings.

---

### 2. React Code (The Alignment Fix)
Replace the code in your `src/App.jsx` inside the inner `voca-preview` folder. This uses `items-end` to ensure the waves grow upward from the base of the stems.

```javascript
import { motion } from "framer-motion";

export default function VocaAboutLoader() {
  const waves = [
    { rest: 20, peak: 50 },
    { rest: 40, peak: 70 },
    { rest: 60, peak: 100 }, // Center wave
    { rest: 40, peak: 70 },
    { rest: 20, peak: 50 }
  ];

  return (
    <div className="flex flex-col items-center justify-center bg-white p-12">
      {/* V-Shape Container */}
      <div className="flex items-end gap-3 h-32">
        
        {/* Left Stem */}
        <div className="w-2.5 h-24 bg-gradient-to-b from-[#704CD9] to-[#E1392E] rounded-full rotate-[20deg] origin-bottom" />

        {/* Animated Waves */}
        {waves.map((w, i) => (
          <motion.div
            key={i}
            className="w-1.5 rounded-full"
            style={{ backgroundColor: i % 2 === 0 ? "#704CD9" : "#E56229" }}
            animate={{ height: [w.rest, w.peak, w.rest] }}
            transition={{ 
              repeat: Infinity, 
              duration: 1.2, 
              delay: i * 0.1,
              ease: "easeInOut" 
            }}
          />
        ))}

        {/* Right Stem */}
        <div className="w-2.5 h-24 bg-gradient-to-b from-[#E1392E] to-[#E56229] rounded-full -rotate-[20deg] origin-bottom" />
      </div>

      {/* Brand Text */}
      <div className="mt-8 text-center">
        <h1 className="text-3xl font-bold text-[#1A1A1E]">Voca<span className="text-[#704CD9]">.</span></h1>
        <p className="text-gray-500 text-sm mt-1">Oral Assessment Platform</p>
        <span className="inline-block mt-4 px-3 py-1 bg-gray-100 text-gray-400 text-xs rounded-full">Version 1.0.0</span>
      </div>
    </div>
  );
}