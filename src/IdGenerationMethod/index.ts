const idCharacter = "000000";

// Web Crypto where it exists (every browser, Node 19+); Math.random where it
// does not. React Native's Hermes has no global `crypto`, so a bare call threw
// `Property 'crypto' doesn't exist` on the first id and no view was ever
// tracked. These values are correlation ids and a sampling number, not
// secrets, so the fallback is acceptable - it is what 1.0.7 shipped.
const hasWebCrypto = (): boolean =>
  typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function";

// Uniform number in [0, 1)
const randomFraction = (): number =>
  hasWebCrypto()
    ? crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
    : Math.random();

const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  if (hasWebCrypto()) {
    return crypto.getRandomValues(bytes);
  }
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
};

// Returns 6 characters id
const generateIdToken: () => string = function () {
  const idPart: string = randomFraction()
    .toString(36)
    .replace("0.", "")
    .slice(0, 6);

  return idCharacter.slice(idPart.length) + idPart;
};

function generateFallbackUUID(): string {
  const bytes = randomBytes(16);
  let i = 0;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const nibble = i % 2 === 0 ? bytes[i >> 1] >> 4 : bytes[i >> 1] & 0xf;
    i++;
    const value = char === "x" ? nibble : (nibble & 0x3) | 0x8;
    return value.toString(16);
  });
}

// Returns unique UUID
const buildUUID: () => string = function () {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return generateFallbackUUID();
};

const generateRandomIdentifier: () => string = function () {
  const randomInt = Math.floor(randomFraction() * Math.pow(36, 6));
  return (idCharacter + randomInt.toString(36)).slice(-6);
};

export { generateIdToken, buildUUID, generateRandomIdentifier, randomFraction };
