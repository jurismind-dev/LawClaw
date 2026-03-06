"""
在 Word 文档中执行修订（Track Changes）和批注操作。
用法: python track_changes.py <docx文件路径> <操作JSON文件路径>

操作JSON格式:
{
  "operations": [
    {
      "type": "modify",
      "search_text": "需要修改的原文",
      "new_text": "修改后的文本",
      "comment": "【高风险】修改理由..."
    },
    {
      "type": "comment_only",
      "search_text": "需要批注的文本",
      "comment": "【低风险】风险说明..."
    },
    {
      "type": "append_comment",
      "comment": "【重大遗漏】缺失条款说明..."
    }
  ]
}

操作类型说明:
  - modify: 查找 search_text，替换为 new_text，并添加批注（高/中风险条款）
  - comment_only: 查找 search_text，仅添加批注不修改文本（低风险条款）
  - append_comment: 在文档末尾添加批注（用于周延完整性检查中的缺失条款）
"""
import sys
import json
from pathlib import Path

try:
    import win32com.client
    import pythoncom
except ImportError:
    print("错误: 需要安装 pywin32 (pip install pywin32)", file=sys.stderr)
    sys.exit(1)


def find_range(doc, search_text: str):
    """在文档中查找文本，返回 Range 对象。"""
    range_obj = doc.Content
    find = range_obj.Find
    find.Text = search_text
    find.Forward = True
    find.Wrap = 0  # wdFindStop
    find.MatchCase = True
    find.MatchWholeWord = False

    if find.Execute():
        return range_obj
    return None


def execute_operations(doc_path: str, operations: list) -> dict:
    """执行所有操作，返回统计结果。"""
    pythoncom.CoInitialize()

    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0

    stats = {"modify": 0, "comment_only": 0, "append_comment": 0, "failed": 0}
    errors = []

    try:
        doc = word.Documents.Open(doc_path)
        doc.TrackRevisions = True

        for i, op in enumerate(operations):
            op_type = op.get("type", "")

            try:
                if op_type == "modify":
                    search_text = op["search_text"]
                    new_text = op["new_text"]
                    comment = op.get("comment", "")

                    range_obj = find_range(doc, search_text)
                    if range_obj:
                        if comment:
                            doc.Comments.Add(range_obj, comment)
                        range_obj.Text = new_text
                        stats["modify"] += 1
                    else:
                        stats["failed"] += 1
                        errors.append(f"操作{i+1}: 未找到文本 \"{search_text[:30]}...\"")

                elif op_type == "comment_only":
                    search_text = op["search_text"]
                    comment = op["comment"]

                    range_obj = find_range(doc, search_text)
                    if range_obj:
                        doc.Comments.Add(range_obj, comment)
                        stats["comment_only"] += 1
                    else:
                        stats["failed"] += 1
                        errors.append(f"操作{i+1}: 未找到文本 \"{search_text[:30]}...\"")

                elif op_type == "append_comment":
                    comment = op["comment"]
                    end_range = doc.Content
                    end_range.Collapse(0)  # wdCollapseEnd
                    doc.Comments.Add(end_range, comment)
                    stats["append_comment"] += 1

                else:
                    stats["failed"] += 1
                    errors.append(f"操作{i+1}: 未知操作类型 \"{op_type}\"")

            except Exception as e:
                stats["failed"] += 1
                errors.append(f"操作{i+1}: {str(e)}")

        doc.Save()
        doc.Close()

    except Exception as e:
        print(f"错误: {str(e)}", file=sys.stderr)
        sys.exit(1)

    finally:
        word.Quit()
        pythoncom.CoUninitialize()

    return {"stats": stats, "errors": errors}


def main():
    if len(sys.argv) < 3:
        print("用法: python track_changes.py <docx文件路径> <操作JSON文件路径>", file=sys.stderr)
        sys.exit(1)

    doc_path = str(Path(sys.argv[1]).resolve())
    json_path = Path(sys.argv[2]).resolve()

    if not Path(doc_path).exists():
        print(f"错误: 文档不存在 {doc_path}", file=sys.stderr)
        sys.exit(1)
    if not json_path.exists():
        print(f"错误: JSON文件不存在 {json_path}", file=sys.stderr)
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    operations = data.get("operations", [])
    if not operations:
        print("警告: 无操作需要执行")
        return

    result = execute_operations(doc_path, operations)

    # 输出结果
    s = result["stats"]
    print(f"执行完成:")
    print(f"  文本修改: {s['modify']}处")
    print(f"  仅批注: {s['comment_only']}条")
    print(f"  末尾批注: {s['append_comment']}条")
    if s["failed"] > 0:
        print(f"  失败: {s['failed']}项")
        for err in result["errors"]:
            print(f"    - {err}")


if __name__ == "__main__":
    main()
