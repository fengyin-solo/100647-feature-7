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

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <section class="checklist-card">
      <header class="checklist-head">
        <div>
          <h3>值班交接待核对清单（垃圾池待倒料）</h3>
          <p class="page-desc">
            垃圾池管理查出来的待倒料结果落到这里，交接双方逐条核对；共 {{ checklist.length }} 条，
            待核对 {{ pendingCheckCount }} 条，已核对 {{ checkedCount }} 条。
          </p>
        </div>
        <button
          v-if="checklist.length"
          class="btn ghost"
          type="button"
          @click="clearChecklistItems"
        >
          清空清单
        </button>
      </header>
      <table v-if="checklist.length" class="data-table">
        <thead>
          <tr>
            <th>池区编号</th>
            <th>倒料日期</th>
            <th>发酵天数</th>
            <th>渗滤液液位</th>
            <th>垃圾存量</th>
            <th>抓斗操作人</th>
            <th>加入时间</th>
            <th>核对状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in checklist" :key="String(item.pitId)">
            <td>{{ item.code }}</td>
            <td>{{ item.dumpDate }}</td>
            <td>{{ item.fermentDays === '' ? '—' : item.fermentDays }}</td>
            <td>{{ item.level === '' ? '—' : item.level }}</td>
            <td>{{ item.storage === '' ? '—' : item.storage }}</td>
            <td>{{ item.operator || '—' }}</td>
            <td>{{ formatTime(item.addedAt) }}</td>
            <td>
              <label class="check-state">
                <input
                  type="checkbox"
                  :checked="item.checked"
                  @change="toggleChecked(item.pitId, !item.checked)"
                />
                {{ item.checked ? '已核对' : '待核对' }}
              </label>
            </td>
            <td>
              <button class="link" type="button" @click="removeItem(item.pitId)">移除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state checklist-empty">
        待核对清单还是空的：可到「垃圾池管理」查出「需倒料」池区后加入清单，交接时逐条核对
      </p>
    </section>

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
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  clearChecklist,
  listChecklist,
  removeCheckItem,
  setCheckItemChecked,
} from '@/api/handover'
import type { HandoverCheckItem } from '@/data/handover-checklist'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('shift')
const columns = ["交接编号", "值班班组", "班次", "交班人员", "接班人员", "交接事项", "交接时间", "交接状态"]
const actions = ["发起交接", "确认交接", "登记遗留"]
const statuses = ["待交接", "交接中", "已交接", "有遗留"]
const stats = [{"label": "待交接班次", "value": 0}, {"label": "已交接班次", "value": 0}, {"label": "有遗留事项", "value": 0}]

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

function resetFilters() {
  filters.value = {}
  reload()
}

const checklist = ref<HandoverCheckItem[]>([])
const pendingCheckCount = computed(() => checklist.value.filter((item) => !item.checked).length)
const checkedCount = computed(() => checklist.value.filter((item) => item.checked).length)

function refreshChecklist() {
  checklist.value = listChecklist()
}

function toggleChecked(pitId: number, checked: boolean) {
  setCheckItemChecked(pitId, checked)
  refreshChecklist()
}

function removeItem(pitId: number) {
  removeCheckItem(pitId)
  refreshChecklist()
}

function clearChecklistItems() {
  clearChecklist()
  refreshChecklist()
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
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
  refreshChecklist()
  reload()
})
</script>
