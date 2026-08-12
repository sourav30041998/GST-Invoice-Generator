import crypto from "node:crypto";

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELIZATION,
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
  if (
    algorithm !== "scrypt" ||
    cost !== String(COST) ||
    blockSize !== String(BLOCK_SIZE) ||
    parallelization !== String(PARALLELIZATION) ||
    !salt ||
    !encodedKey
  ) {
    return false;
  }

  const expected = Buffer.from(encodedKey, "base64url");
  if (expected.length !== KEY_LENGTH) {
    return false;
  }

  const actual = await deriveKey(password, salt);
  return crypto.timingSafeEqual(actual, expected);
}
