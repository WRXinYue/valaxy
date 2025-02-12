<script lang="ts" setup>
import type { NavItemWithChildren } from '../types'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PressMenuLink from './PressMenuLink.vue'
import PressNavItemGroupChild from './PressNavItemGroupChild.vue'

defineProps<{
  item: NavItemWithChildren
}>()

const open = ref(false)

const { t } = useI18n()
</script>

<template>
  <div
    class="flex relative group"
    h="full"
    :aria-expanded="open"
    aria-haspopup="true"
    @mouseenter="open = true"
    @mouseleave="open = false"
  >
    <button
      type="button"
      class="button flex items-center bg-transparent"
      h="full"
      @click="open = !open"
    >
      <span v-if="item.text" class="text">
        {{ item.text.includes(".") ? t(item.text) : item.text }}
      </span>
      <div i-ri-arrow-drop-down-line />
    </button>

    <div class="menu grow" flex="~ col" items="start">
      <template v-for="itemLink in item.items" :key="JSON.stringify(itemLink)">
        <PressMenuLink v-if="'link' in itemLink" :item="itemLink" />
        <PressNavItemGroupChild
          v-else
          :text="itemLink.text"
          :items="itemLink.items"
        />
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.group .button {
  color: var(--pr-nav-text);
  font-weight: 500;
  font-size: 14px;
}

.group[aria-expanded="true"] .button {
  color: rgb(60 60 60 / 0.70);
  transition: color 0.25s;

  .dark & {
    color: rgb(235 235 235 / 0.6)
  }
}

.menu {
  position: absolute;
  top: 20px;
  left: 50%;
  min-width: 128px;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.25s,
    visibility 0.25s,
    transform 0.25s;
  transform: translateX(-50%) translateY(calc(var(--pr-nav-height) / 2));
  border-radius: 12px;
  padding: 12px;
  border: 1px solid rgb(60 60 60 / 0.12);
  background-color: #fff;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.08);

  .dark & {
    background-color: #242424;
  }

}

.group[aria-expanded="true"] > .menu {
  opacity: 1;
  visibility: visible;
}
</style>
