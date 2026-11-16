declare module 'json-bigint' {
  export interface JSONBigOptions {
    storeAsString?: boolean
    alwaysParseAsBig?: boolean
    useNativeBigInt?: boolean
    protoAction?: 'error' | 'ignore' | 'preserve'
    constructorAction?: 'error' | 'ignore' | 'preserve'
  }

  export interface JSONBig {
    parse(text: string): any
    stringify(value: any): string
  }

  export default function JSONBigFactory(options?: JSONBigOptions): JSONBig
}
