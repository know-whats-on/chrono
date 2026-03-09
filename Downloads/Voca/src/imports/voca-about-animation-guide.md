# Voca "About" Section Animation Guide

To integrate the clinical **Voca** loading animation into the white space of your mobile app's **About** section, use the following technical setup for both Figma and your React project.

---

### 1. Figma Component Logic
This setup uses **Smart Animate** to create the "longer-shorter" pulsing effect between your brand stems.

**Frame 1: The "Rest" State**
* **Dimensions**: $300 \times 200$ px (White Background #FFFFFF).
* **Left Stem**: Capsule $10 \times 80$ px. Gradient: **#704CD9** to **#E1392E**. Rotation: **22°**.
* **Right Stem**: Capsule $10 \times 80$ px. Gradient: **#E1392E** to **#E56229**. Rotation: **-22°**.
* **Middle Waves (5 total)**: Capsules $6$ px wide, alternating colors **#704CD9** and **#E56229**.
    * **Heights**: `[15, 25, 40, 25, 15]` px.

**Frame 2: The "Peak" State**
* Duplicate Frame 1 and rename to `Voca_Peak`.
* Keep stems static. Adjust only the middle wave heights to create the pulse:
    * **Heights**: `[45, 65, 80, 65, 45]` px.

**Prototyping Interaction**
* **Trigger**: After Delay ($1$ ms).
* **Action**: Smart Animate.
* **Easing**: Ease In and Out ($600$ ms).
* **Loop**: Link `Voca_Peak` back to `Voca_Start` with the same settings.



---

### 2. React Implementation (App.jsx)
Inside your `voca-preview` directory, replace your code with this light-mode version designed for the **About** section.

```javascript
import { motion } from "framer-motion";

export default function VocaAboutLoader() {
  // Wave height settings for the longer-shorter pulse
  const waves = [
    { rest: 15, peak: 45 },
    { rest: 25, peak: 65 },
    { rest: 40, peak: 80 }, // Center
    { rest: 25, peak: 65 },
    { rest: 15, peak: 45 }
  ];

  return (
    <div className="flex items-center justify-center bg-white p-12 rounded-3xl border border-gray-100">
      <div className="relative flex items-center justify-center">
        
        {/* Left Stem */}
        <div className="w-2.5 h-20 bg-gradient-to-b from-[#704CD9] to-[#E1392E] rounded-full rotate-[22deg] -translate-x-10" />

        {/* Animated Middle Waves */}
        <div className="flex items-center gap-2">
          {waves.map((w, i) => (
            <motion.div
              key={i}
              className="w-1.5 rounded-full"
              style={{ backgroundColor: i % 2 === 0 ? "#704CD9" : "#E56229" }}
              animate={{ height: [w.rest, w.peak, w.rest] }}
              transition={{ 
                repeat: Infinity, 
                duration: 1.2, 
                delay: i * 0.15,
                ease: "easeInOut" 
              }}
            />
          ))}
        </div>

        {/* Right Stem */}
        <div className="w-2.5 h-20 bg-gradient-to-b from-[#E1392E] to-[#E56229] rounded-full -rotate-[22deg] translate-x-10" />
      </div>
    </div>
  );
}