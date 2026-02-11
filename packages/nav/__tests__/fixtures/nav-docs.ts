/**
 * File docs go here.
 *
 * Multiple paragraphs should be preserved.
 */

export class Foo {
  /** Return a Foo. */
  public static get(): Foo {
    return new Foo();
  }

  /**
   * Make a Bar, maybe.
   * @deprecated old api
   */
  public async makeBar(options: { verbose?: boolean } = {}): Promise<null> {
    return null;
  }

  protected hidden(): void {}
  #reallyHidden(): void {}
}

export const LATE = 1;
