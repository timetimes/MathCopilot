import math
from typing import Any


NAME = "geometry_basics"
DESCRIPTION = "计算两点间距离、中点坐标、线段可视化数据"


def distance(x1: float, y1: float, x2: float, y2: float) -> float:
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def midpoint(x1: float, y1: float, x2: float, y2: float) -> dict[str, float]:
    return {"x": (x1 + x2) / 2, "y": (y1 + y2) / 2}


def visualize_segment(x1: float, y1: float, x2: float, y2: float) -> dict[str, Any]:
    return {
        "type": "geometry",
        "elements": [
            {"type": "point", "label": "A", "x": x1, "y": y1, "color": "blue"},
            {"type": "point", "label": "B", "x": x2, "y": y2, "color": "blue"},
            {"type": "segment", "from": "A", "to": "B", "color": "red"},
            {"type": "point", "label": "M", **midpoint(x1, y1, x2, y2), "color": "green"},
        ],
        "metadata": {
            "distance": round(distance(x1, y1, x2, y2), 4),
            "midpoint": midpoint(x1, y1, x2, y2),
        },
    }


def run(params: dict[str, Any]) -> dict[str, Any]:
    x1 = params.get("x1", 0)
    y1 = params.get("y1", 0)
    x2 = params.get("x2", 4)
    y2 = params.get("y2", 3)
    return visualize_segment(x1, y1, x2, y2)
