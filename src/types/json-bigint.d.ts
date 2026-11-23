declare module 'json-bigint' {
  export interface JSONBigOptions {
    storeAsString?: boolean
    alwaysParseAsBig?: boolean
    useNativeBigInt?: boolean
    protoAction?: 'error' | 'ignore' | 'preserve'
    constructorAction?: 'error' | 'ignore' | 'preserve'
  }

  export interface JSONBig {
    parse(text: string): unknown
    stringify(value: unknown): string
  }

  export default function JSONBigFactory(options?: JSONBigOptions): JSONBig
}
