export const token = Symbol();

export const Anonymous = class {
  value = 1;

  method() {
    return "anonymous";
  }
};

export const NamedExpression = class InternalName {
  value = 2;
};

function makeLocal() {
  class Local {
    value = 3;
  }

  return new Local();
}

export const nonNameable = makeLocal();

class Nominal {
  private readonly brand = undefined;
  value = 4;
}

export const nominal = new Nominal();

export class PublicNominal {
  private readonly brand = undefined;
  value = 5;
}

export const publicNominal = new PublicNominal();
