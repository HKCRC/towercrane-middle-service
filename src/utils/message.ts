class Message {
  constructor(
    public userID: number,
    public timeStamp: number,
    public type: number,
    public valueArray1: number[],
    public valueArray2: number[]
  ) {
    this.userID = userID;
    this.timeStamp = timeStamp;
    this.type = type;
    this.valueArray1 = valueArray1;
    this.valueArray2 = valueArray2;
  }
}

function toBinaryData(message: any) {
  const buffer = Buffer.alloc(1 + 8 + 1 + 2 * 3 + 8 * 3);
  let offset = 0;

  // 写入 user_id
  buffer.writeUInt8(message.user_id, offset);
  offset += 1;

  // 写入 time_stamp
  buffer.writeBigInt64BE(BigInt(message.time_stamp), offset);
  offset += 8;

  // 写入 command_type
  buffer.writeUInt8(message.command_type, offset);
  offset += 1;

  // 写入 value_array1
  for (let i = 0; i < 3; i++) {
    buffer.writeInt16BE(message.value_array1[i], offset);
    offset += 2;
  }

  // 写入 value_array2
  for (let i = 0; i < 3; i++) {
    buffer.writeDoubleBE(message.value_array2[i], offset);
    offset += 8;
  }

  return buffer;
}

// 解析二进制数据的函数
function parseBinaryData(buffer) {
  let offset = 0;

  // 读取 user_id
  const user_id = buffer.readUInt8(offset);
  offset += 1;

  // 读取 time_stamp
  const time_stamp = buffer.readBigInt64BE(offset);
  offset += 8;

  // 读取 command_type
  const command_type = buffer.readUInt8(offset);
  offset += 1;

  // 读取 value_array1
  const value_array1 = [];
  for (let i = 0; i < 3; i++) {
    value_array1.push(buffer.readInt16BE(offset));
    offset += 2;
  }

  // 读取 value_array2
  const value_array2 = [];
  for (let i = 0; i < 3; i++) {
    value_array2.push(buffer.readDoubleBE(offset));
    offset += 8;
  }

  return new Message(
    user_id,
    time_stamp,
    command_type,
    value_array1,
    value_array2
  );
}

export { Message, parseBinaryData, toBinaryData };
