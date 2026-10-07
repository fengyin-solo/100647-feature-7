<template>
  <section class="page" data-module="shift">
    <header class="page-head">
      <div>
        <h2>值班交接班管理</h2>
        <p class="page-desc">维护交接班记录，围绕交接编号、值班班组、班次、交班人员做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记交接班记录</button>
        <button class="btn" type="button" @click="exportRows">导出值班交接班清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <!-- 垃圾池倒料定位结果落到这里：接班先核对待倒料池区 -->
    <section class="check-panel">
      <header class="check-head">
        <h3>交接待核对清单（垃圾池倒料）</h3>
        <div class="check-actions">
          <span class="check-count">待核对 {{ pendingCount }} 条 · 已核对 {{ checkedCount }} 条</span>
          <button class="btn btn-sm ghost" type="button" :disabled="!checkedCount" @click="clearChecked">清除已核对</button>
        </div>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th>池区编号</th>
            <th>发酵天数</th>
            <th>渗滤液液位</th>
            <th>口径日期</th>
            <th>加入时间</th>
            <th>核对说明</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in checklist" :key="item.id" :class="{ 'is-checked': item.checked }">
            <td>{{ item.code }}</td>
            <td>{{ item.fermentDays }} 天</td>
            <td>{{ item.leachateMeter }}m</td>
            <td>{{ item.basisDate }}</td>
            <td>{{ item.createdAt }}</td>
            <td>{{ item.remark }}</td>
            <td>
              <span class="tag" :class="item.checked ? 'tag-low' : 'tag-high'">
                {{ item.checked ? '已核对' : '待核对' }}
              </span>
            </td>
            <td class="row-actions">
              <button class="link" type="button" @click="toggle(item.id, !item.checked)">
                {{ item.checked ? '恢复待核对' : '核对完成' }}
              </button>
              <button class="link danger" type="button" @click="remove(item.id)">移除</button>
            </td>
          </tr>
          <tr v-if="!checklist.length">
            <td colspan="8" class="empty-state">待核对清单还是空的：到「垃圾池管理」用倒料定位查出需倒料池区后，可一键加入这里。</td>
          </tr>
        </tbody>
      </table>
      <p v-if="notice" class="ok-text">{{ notice }}</p>
    </section>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无值班交接班数据，可先登记交接班记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条值班交接班记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  clearCheckedItems,
  handoverChecklist,
  markChecklistChecked,
  removeChecklistItem,
} from '@/api/handover-service'
import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { ChecklistItem, EntryRow } from '@/data/types'

const meta = moduleMeta('shift')
const columns = ['交接编号', '值班班组', '班次', '交班人员', '接班人员', '交接事项', '交接时间', '交接状态']
const actions = ['发起交接', '确认交接', '登记遗留']
const statuses = ['待交接', '交接中', '已交接', '有遗留']
const stats = [{ label: '待交接班次', value: 0 }, { label: '已交接班次', value: 0 }, { label: '有遗留事项', value: 0 }]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const checklist = ref<ChecklistItem[]>([])
const notice = ref('')
const pendingCount = computed(() => checklist.value.filter((item) => !item.checked).length)
const checkedCount = computed(() => checklist.value.filter((item) => item.checked).length)

function loadChecklist() {
  checklist.value = handoverChecklist()
}

function toggle(id: number, checked: boolean) {
  const result = markChecklistChecked(id, checked)
  notice.value = result.ok ? result.message : ''
  if (!result.ok) errorMessage.value = result.message
  loadChecklist()
}

function remove(id: number) {
  const result = removeChecklistItem(id)
  notice.value = result.ok ? result.message : ''
  if (!result.ok) errorMessage.value = result.message
  loadChecklist()
}

function clearChecked() {
  clearCheckedItems()
  notice.value = '已清除核对完成的条目'
  loadChecklist()
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '交接班记录登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '值班交接班列表读取失败'
  }
}

onMounted(() => {
  reload()
  loadChecklist()
})
</script>
