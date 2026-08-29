import crypto from "node:crypto";

const KEY_LENGTH = 64;
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 3;
const MAX_MEMORY = 128 * 1024 * 1024;

type ScryptParameters = {
  cost: number;
  blockSize: number;
  parallelization: number;
};

function deriveKey(
  password: string,
  salt: string,
  parameters: ScryptParameters = {
    cost: COST,
    blockSize: BLOCK_SIZE,
    parallelization: PARALLELIZATION,
  },
) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: parameters.cost,
        r: parameters.blockSize,
        p: parameters.parallelization,
        maxmem: MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derivedKey = await deriveKey(password, salt);
  return [
    "scrypt",
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELIZATION),
    salt,
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, cost, blockSize, parallelization, salt, encodedKey] =
    storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedKey) {
    return false;
  }

  const expected = Buffer.from(encodedKey, "base64url");
  const parameters = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
  };
  if (
    expected.length !== KEY_LENGTH ||
    !Number.isInteger(parameters.cost) ||
    !Number.isInteger(parameters.blockSize) ||
    !Number.isInteger(parameters.parallelization) ||
    parameters.cost < 16_384 ||
    parameters.cost > COST ||
    parameters.blockSize !== BLOCK_SIZE ||
    parameters.parallelization < 1 ||
    parameters.parallelization > PARALLELIZATION
  ) {
    return false;
  }

  const actual = await deriveKey(password, salt, parameters);
  return crypto.timingSafeEqual(actual, expected);
}

export function passwordNeedsRehash(storedHash: string) {
  const [algorithm, cost, blockSize, parallelization] = storedHash.split("$");
  return (
    algorithm !== "scrypt" ||
    cost !== String(COST) ||
    blockSize !== String(BLOCK_SIZE) ||
    parallelization !== String(PARALLELIZATION)
  );
}
