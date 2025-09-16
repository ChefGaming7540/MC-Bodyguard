// console-colors.js
const wrap = (code) => (text) => `\x1b[${code}m${text}\x1b[0m`;

module.exports = {
  reset: wrap(0),
  cyan: wrap(36),
  purple: wrap(35),
  blue: wrap(34),
  yellow: wrap(33),
  green: wrap(32),
  red: wrap(31),
  gray: wrap(90),
  magenta: wrap(95),
  pink: wrap(95),
  orange: wrap(33),
  white: wrap(37),
  black: wrap(30),
  brightRed: wrap(91),
  brightGreen: wrap(92),
  brightYellow: wrap(93),
  brightBlue: wrap(94),
  brightMagenta: wrap(95),
  brightCyan: wrap(96),
  brightWhite: wrap(97),
};