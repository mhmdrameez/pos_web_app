const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

export class EscPosEncoder {
  private buffer: number[] = []
  private maxChars: number

  constructor(paperWidth: 58 | 80 = 58) {
    this.maxChars = paperWidth === 80 ? 48 : 32
    this.init()
  }

  private init(): this {
    this.buffer.push(ESC, 0x40)
    return this
  }

  text(content: string): this {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(content)
    this.buffer.push(...bytes)
    return this
  }

  newline(count = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(LF)
    }
    return this
  }

  bold(enabled = true): this {
    this.buffer.push(ESC, 0x45, enabled ? 1 : 0)
    return this
  }

  align(mode: 'left' | 'center' | 'right'): this {
    const value = mode === 'left' ? 0 : mode === 'center' ? 1 : 2
    this.buffer.push(ESC, 0x61, value)
    return this
  }

  size(width: 1 | 2 = 1, height: 1 | 2 = 1): this {
    const value = ((width - 1) << 4) | (height - 1)
    this.buffer.push(GS, 0x21, value)
    return this
  }

  separator(char = '-'): this {
    return this.text(char.repeat(this.maxChars)).newline()
  }

  tableRow(left: string, right: string): this {
    const space = this.maxChars - left.length - right.length
    const padding = Math.max(1, space)
    return this.text(`${left}${' '.repeat(padding)}${right}`).newline()
  }

  cut(partial = false): this {
    this.buffer.push(GS, 0x56, partial ? 1 : 0)
    return this
  }

  encode(): Uint8Array {
    return new Uint8Array(this.buffer)
  }

  reset(paperWidth: 58 | 80): EscPosEncoder {
    this.buffer = []
    this.maxChars = paperWidth === 80 ? 48 : 32
    return this.init()
  }
}
