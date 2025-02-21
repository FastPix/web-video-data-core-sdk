import { v4 as uuidv4 } from "uuid";

// Returns 6 characters id
const generateIdToken: () => string = function () {
  const idPart: string = Math.random()
    .toString(36)
    .replace("0.", "")
    .slice(0, 6);

  return "000000".slice(idPart.length) + idPart;
};

// Returns unique UUID
const buildUUID: () => string = function () {

  return uuidv4();
};

const generateRandomIdentifier: () => string = function () {
  return (
    "000000" + ((Math.random() * Math.pow(36, 6)) << 0).toString(36)
  ).slice(-6);
};

export { generateIdToken, buildUUID, generateRandomIdentifier };
