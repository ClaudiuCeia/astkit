import { User, UserService, createUser, Role } from "./simple.ts";

const service = new UserService();

const user: User = createUser({
  id: "1",
  name: "Alice",
  email: "alice@example.com",
});

service.add(user);

const found = service.findById("1");

export function getUserRole(_user: User): Role {
  return Role.User;
}
