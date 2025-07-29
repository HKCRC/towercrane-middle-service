# 身份权限模块 API 文档

## 概述
身份权限模块提供了对 `AccessIdentity` 表的完整 CRUD 操作，包括创建、查询、更新和删除权限身份。

## API 接口

### 1. 创建权限身份
**接口地址：** `POST /access/createIdentity`

**请求参数：**
```json
{
  "identityName": "管理员",
  "identityValue": "admin,user,read,write",
  "extraInfo": "{\"description\": \"系统管理员权限\"}"
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "创建身份成功",
  "data": {
    "id": 1,
    "identity_id": "uuid-string",
    "identity_name": "管理员",
    "identity_value": "admin,user,read,write",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "extra_info_json": "{\"description\": \"系统管理员权限\"}"
  }
}
```

### 2. 获取权限列表
**接口地址：** `GET /access/identity/list`

**请求参数：**
```
?page=1&pageSize=10
```

**响应示例：**
```json
{
  "success": true,
  "message": "获取权限列表成功",
  "data": [
    {
      "id": 1,
      "identity_id": "uuid-string",
      "identity_name": "管理员",
      "identity_value": "admin,user,read,write",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "extra_info_json": "{\"description\": \"系统管理员权限\"}"
    }
  ],
  "total": 1
}
```

### 3. 获取权限详情
**接口地址：** `GET /access/identity/detail`

**请求参数：**
```
?identity_id=uuid-string
```

**响应示例：**
```json
{
  "success": true,
  "message": "获取权限详情成功",
  "data": {
    "id": 1,
    "identity_id": "uuid-string",
    "identity_name": "管理员",
    "identity_value": "admin,user,read,write",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "extra_info_json": "{\"description\": \"系统管理员权限\"}"
  }
}
```

### 4. 更新权限身份
**接口地址：** `POST /access/identity/update`

**请求参数：**
```json
{
  "identity_id": "uuid-string",
  "identity_name": "超级管理员",
  "identity_value": "admin,user,read,write,delete",
  "extra_info_json": "{\"description\": \"超级管理员权限\"}"
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "更新权限成功",
  "data": {
    "id": 1,
    "identity_id": "uuid-string",
    "identity_name": "超级管理员",
    "identity_value": "admin,user,read,write,delete",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "extra_info_json": "{\"description\": \"超级管理员权限\"}"
  }
}
```

### 5. 删除权限身份
**接口地址：** `POST /access/identity/delete`

**请求参数：**
```json
{
  "identity_id": "uuid-string"
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "删除权限成功",
  "data": null
}
```

## 数据库表结构

### AccessIdentity 表
| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | Int | 主键，自增 |
| identity_id | String | 身份ID，唯一标识 |
| identity_name | String | 身份名称 |
| identity_value | String | 拥有的权限，用逗号分隔 |
| createdAt | DateTime | 创建时间 |
| extra_info_json | Json | 额外信息，JSON格式 |

## 注意事项

1. 所有接口都需要 JWT 认证，请在请求头中携带有效的 token
2. `identity_value` 字段用于存储权限值，建议使用逗号分隔的字符串格式
3. `extra_info_json` 字段可以存储任意 JSON 格式的额外信息
4. 分页查询的 `page` 从 1 开始计数
5. 删除操作不可恢复，请谨慎使用

## 错误处理

所有接口都会返回统一的响应格式：
```json
{
  "success": false,
  "message": "错误信息",
  "data": null
}
```

常见错误：
- 参数验证失败
- 权限不存在
- 数据库操作失败
- JWT 认证失败 