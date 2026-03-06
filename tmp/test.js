const rundownIntentRE = /^(?:what(?:'?s|\s+(?:am|do|is|are|have|did))\s+(?:i\s+(?:doing|have|got)|(?:on|happening|going\s+on|planned|scheduled|up))(?:\s+(?:on|for|at))?\s*|(?:what|anything)\s+(?:on|for)\s+|(?:my\s+)?(?:schedule|plans?|agenda|calendar|day)\s+(?:for|on)\s+|(?:how(?:'?s|\s+(?:is|does)))\s+|(?:run\s+me\s+through|rundown\s+(?:for|of)|show\s+me)\s+(?:my\s+)?|(?:give\s+me\s+(?:a\s+)?(?:rundown|overview|briefing)\s+(?:for|of|on)\s+)|what(?:'?s|\s+does)\s+my\s+(.+?)\s+(?:look\s+)?like)(.*)$/i;

const q1 = "what have i got on tomorrow";
const m1 = q1.match(rundownIntentRE);
console.log("q1:", m1 ? m1[2] : null);

const q2 = "what do i have going on tomorrow";
const m2 = q2.match(rundownIntentRE);
console.log("q2:", m2 ? m2[2] : null);

const q3 = "whats my schedule for tomorrow";
const m3 = q3.match(rundownIntentRE);
console.log("q3:", m3 ? m3[2] : null);

const q4 = "what am i doing tomorrow";
const m4 = q4.match(rundownIntentRE);
console.log("q4:", m4 ? m4[2] : null);
