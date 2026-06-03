const idCharacter = "000000";

// Returns 6 characters id
const generateIdToken: () => string = function () {
  const idPart: string = (
    crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
  )
    .toString(36)
    .replace("0.", "")
    .slice(0, 6);

  return idCharacter.slice(idPart.length) + idPart;
};

function generateFallbackUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
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
  const randomInt =
    crypto.getRandomValues(new Uint32Array(1))[0] % Math.trunc(Math.pow(36, 6));
  return (idCharacter + randomInt.toString(36)).slice(-6);
};

export { generateIdToken, buildUUID, generateRandomIdentifier };
