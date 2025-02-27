#!/usr/bin/env python3
import sys
import json
import struct
import os
import platform
import subprocess
from pathlib import Path

# 用于与Chrome扩展通信的消息处理
def send_message(message):
    encoded = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    message_length = struct.unpack('I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

def list_directory(path):
    try:
        path = Path(path)
        files = []
        for item in path.iterdir():
            files.append({
                'name': item.name,
                'path': str(item),
                'isDirectory': item.is_dir()
            })
        return {'success': True, 'files': files}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def save_text(path, content, append=False):
    try:
        # 转换路径格式
        path = Path(path)
        # 确保父目录存在
        path.parent.mkdir(parents=True, exist_ok=True)
        
        # 写入文件
        mode = 'a' if append else 'w'
        with open(path, mode, encoding='utf-8') as f:
            if append and f.tell() > 0:
                f.write('\n\n')
            f.write(content)
            
        return {'success': True, 'path': str(path)}
    except Exception as e:
        return {'success': False, 'error': f'保存文件失败: {str(e)}'}

def ensure_directory(path):
    try:
        # 转换路径格式
        path = str(Path(path))
        # 创建目录
        Path(path).mkdir(parents=True, exist_ok=True)
        return {'success': True, 'path': path}
    except Exception as e:
        return {'success': False, 'error': f'创建目录失败: {str(e)}'}

def main():
    while True:
        message = read_message()
        if not message:
            break

        response = {'success': False, 'error': 'Unknown action'}
        
        if message.get('action') == 'listDirectory':
            response = list_directory(message.get('path', os.path.expanduser('~')))
        elif message.get('action') == 'saveText':
            response = save_text(
                message.get('path'),
                message.get('content', ''),
                message.get('append', False)
            )
        elif message.get('action') == 'ensureDirectory':
            response = ensure_directory(message.get('path'))
            
        send_message(response)

if __name__ == '__main__':
    main() 