const idCharacter = "000000";

// Returns 6 characters id
const generateIdToken: () => string = function () {
  const idPart: string = Math.random()
    .toString(36)
    .replace("0.", "")
    .slice(0, 6);

  return idCharacter.slice(idPart.length) + idPart;
};

function generateFallbackUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    function (char) {
      const random = (Math.random() * 16) | 0;
      const value = char === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    },
  );
}

// Returns unique UUID
const buildUUID: () => string = function () {
  return generateFallbackUUID();
};

const generateRandomIdentifier: () => string = function () {
  return (
    idCharacter + ((Math.random() * Math.pow(36, 6)) << 0).toString(36)
  ).slice(-6);
};

export { generateIdToken, buildUUID, generateRandomIdentifier };
