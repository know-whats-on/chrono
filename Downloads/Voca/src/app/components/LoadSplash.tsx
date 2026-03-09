import React from "react";
import { motion } from "motion/react";
import svgPaths from "../../imports/svg-qd05zunzc7";

interface LoadSplashProps {
  /** Container size in Tailwind classes (default: "w-10 h-9") */
  className?: string;
  /** Grey tone for all paths (default: "#b0b0b4") */
  color?: string;
  /** Lighter grey for shadow/detail paths (default: "#d1d1d6") */
  colorLight?: string;
}

export function LoadSplash({
  className = "w-20 h-[4.5rem]",
  color = "#b0b0b4",
  colorLight = "#d1d1d6",
}: LoadSplashProps) {
  const barTransition = (delay: number) => ({
    repeat: Infinity,
    duration: 1.4,
    delay,
    ease: "easeInOut" as const,
  });

  return (
    <div className={className}>
      <svg
        className="w-full h-full"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 1015.76 896.692"
      >
        <g clipPath="url(#clip0_loadsplash)">
          <g>
            {/* V outline + structural paths — static */}
            <path d={svgPaths.pbf61800} fill={color} />
            <path d={svgPaths.p150d8e80} fill={colorLight} />
            <path d={svgPaths.p229c9e00} fill={color} />
            <path d={svgPaths.p2dff2200} fill={color} />
            <path d={svgPaths.p32fe9bf0} fill={colorLight} />
            <path d={svgPaths.p1528c400} fill={colorLight} />
            <path d={svgPaths.p2a7060c0} fill={colorLight} />
            <path d={svgPaths.p20cdc600} fill={colorLight} />
            <path d={svgPaths.p2eb53200} fill={colorLight} />

            {/* Right inner bar — biggest pulse */}
            <motion.g
              style={{ transformOrigin: "689px 425px" }}
              animate={{ scaleY: [1, 0.45, 1] }}
              transition={barTransition(0)}
            >
              <path d={svgPaths.p33998080} fill={color} />
            </motion.g>

            {/* Center bar group — animated */}
            <motion.g
              style={{ transformOrigin: "552px 374px" }}
              animate={{ scaleY: [1, 0.4, 1] }}
              transition={barTransition(0)}
            >
              <path d={svgPaths.p249d7e00} fill={color} />
              <path d={svgPaths.p32323ef0} fill={colorLight} />
              <path d={svgPaths.p3938e180} fill={colorLight} />
              <path d={svgPaths.p23466300} fill={colorLight} />
              <path d={svgPaths.p3b94ea00} fill={colorLight} />
              <path d={svgPaths.p32412900} fill={colorLight} />
            </motion.g>

            {/* Right V arm — static */}
            <path d={svgPaths.p2b908a00} fill={color} />
            <path d={svgPaths.p2392cc80} fill={colorLight} />
            <path d={svgPaths.p2905d400} fill={color} />

            {/* Right middle bar — medium pulse */}
            <motion.g
              style={{ transformOrigin: "758px 410px" }}
              animate={{ scaleY: [1, 0.6, 1] }}
              transition={barTransition(0.12)}
            >
              <path d={svgPaths.p26b97b00} fill={color} />
            </motion.g>

            {/* Left inner bar — biggest pulse */}
            <motion.g
              style={{ transformOrigin: "484px 361px" }}
              animate={{ scaleY: [1, 0.45, 1] }}
              transition={barTransition(0)}
            >
              <path d={svgPaths.p188dea00} fill={color} />
              <path d={svgPaths.p27d93f00} fill={colorLight} />
            </motion.g>

            {/* Right outer bar — smallest pulse */}
            <motion.g
              style={{ transformOrigin: "827px 386px" }}
              animate={{ scaleY: [1, 0.75, 1] }}
              transition={barTransition(0.24)}
            >
              <path d={svgPaths.pdd8af00} fill={color} />
              <path d={svgPaths.p328a6e00} fill={colorLight} />
              <path d={svgPaths.p3c758380} fill={color} />
            </motion.g>

            {/* Left middle bar — medium pulse */}
            <motion.g
              style={{ transformOrigin: "415px 364px" }}
              animate={{ scaleY: [1, 0.6, 1] }}
              transition={barTransition(0.12)}
            >
              <path d={svgPaths.p180fa600} fill={color} />
              <path d={svgPaths.p3741ab00} fill={colorLight} />
            </motion.g>

            {/* Left outer bar — smallest pulse */}
            <motion.g
              style={{ transformOrigin: "346px 356px" }}
              animate={{ scaleY: [1, 0.75, 1] }}
              transition={barTransition(0.24)}
            >
              <path d={svgPaths.p2b8a9d00} fill={color} />
              <path d={svgPaths.p3c37980} fill={colorLight} />
            </motion.g>

            <path d={svgPaths.p2ecb6380} fill={colorLight} />
          </g>
        </g>
        <defs>
          <clipPath id="clip0_loadsplash">
            <rect fill="white" height="896.692" width="1015.76" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}