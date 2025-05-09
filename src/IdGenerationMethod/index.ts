import { v4 as uuidv4 } from "uuid";

const idCharacter = "000000";

// Returns 6 characters id
const generateIdToken: () => string = function () {
  const idPart: string = Math.random()
    .toString(36)
    .replace("0.", "")
    .slice(0, 6);

  return idCharacter.slice(idPart.length) + idPart;
};

// Returns unique UUID
const buildUUID: () => string = function () {
  return uuidv4();
};

const generateRandomIdentifier: () => string = function () {
  
  return (
    idCharacter + ((Math.random() * Math.pow(36, 6)) << 0).toString(36)
  ).slice(-6);
};

export { generateIdToken, buildUUID, generateRandomIdentifier };
