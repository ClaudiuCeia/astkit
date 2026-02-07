export interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  private users: User[] = [];

  add(user: User): void {
    this.users.push(user);
  }

  findById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }
}

export function createUser(data: Partial<User>): User {
  return {
    id: data.id ?? "default-id",
    name: data.name ?? "Anonymous",
    email: data.email ?? "none@example.com",
  };
}

export const DEFAULT_USER: User = {
  id: "0",
  name: "Default",
  email: "default@example.com",
};

export type UserId = string;

export enum Role {
  Admin = "admin",
  User = "user",
  Guest = "guest",
}
