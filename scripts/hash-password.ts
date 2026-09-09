import { hashPassword } from "@/server/auth/password";

const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run auth:hash-password -- <password>");
  process.exit(1);
}

hashPassword(password)
  .then((hash) => {
    console.log(hash);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
