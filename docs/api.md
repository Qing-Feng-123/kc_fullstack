# KC FullStack API 文档

## 数据推送接口（Tampermonkey 脚本调用）

### POST /functions/v1/kc-ingest-deck
接收 api_get_member/deck 原始数据

**请求头：**
- `Authorization: Bearer <API_KEY>`
- `Content-Type: application/json`

**请求体：**
```json
{
    "raw_data": {
        "api_id": 1,
        "api_name": "第1艦隊",
        "api_ship": [1, 2, 3, 4, 5, 6]
    }
}
```

### POST /functions/v1/kc-ingest-ship2
接收 api_get_member/ship2 原始数据

**请求体：**
```json
{
    "raw_data": [
        {"api_id": 1, "api_lv": 28, "api_name": "赤城", ...},
        {"api_id": 2, "api_lv": 19, "api_name": "摩耶", ...}
    ]
}
```

## 数据查询接口（前端展示页面调用）

### GET /functions/v1/kc-query-fleet?fleet_no=1
查询指定舰队完整数据

**请求头：**
- `Authorization: Bearer <API_KEY>`

**响应：**
```json
{
    "fleet_no": 1,
    "fleet_name": "第1艦隊",
    "mission": {"status": 0, "expedition_id": 0, "return_time": 0},
    "ships": [...]
}
```
