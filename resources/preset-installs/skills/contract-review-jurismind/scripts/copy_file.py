"""
创建合同副本。
用法: python copy_file.py <源文件路径>
输出: 在同目录下创建 "原文件名_审核版.docx"，打印副本路径。
"""
import sys
import shutil
from pathlib import Path


def main():
    if len(sys.argv) < 2:
        print("用法: python copy_file.py <源文件路径>", file=sys.stderr)
        sys.exit(1)

    src = Path(sys.argv[1]).resolve()
    if not src.exists():
        print(f"错误: 文件不存在 {src}", file=sys.stderr)
        sys.exit(1)

    dst = src.parent / f"{src.stem}_审核版{src.suffix}"
    shutil.copy2(src, dst)
    print(str(dst))


if __name__ == "__main__":
    main()
