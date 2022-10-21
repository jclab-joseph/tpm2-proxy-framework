export class FifoBuffer {
  private _buffer: Buffer = Buffer.alloc(65536);
  private _position: number = 0;

  public push(chunk: Buffer): void {
    chunk.copy(this._buffer, this._position);
    this._position += chunk.length;
  }

  public getLength(): number {
    return this._position;
  }

  public peek(length: number): Buffer {
    const output = Buffer.alloc(length);
    this._buffer.copy(output, 0, 0, length);
    return output;
  }

  public pop(length: number): Buffer {
    const output = Buffer.alloc(length);
    this._buffer.copy(output, 0, 0, length);
    this._position -= length;
    this._buffer.copyWithin(0, length, this._position);
    return output;
  }
}
