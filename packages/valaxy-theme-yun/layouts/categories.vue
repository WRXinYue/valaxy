<script lang="ts" setup>
import { defineWebPage, useSchemaOrg } from '@unhead/schema-org/vue'
import { useCategories, useFrontmatter, useSiteStore, useValaxyI18n } from 'valaxy'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()

const site = useSiteStore()
const frontmatter = useFrontmatter()

const route = useRoute()
const curCategory = computed(() => (route.query.category as string || ''))
const categories = useCategories()

const pageIcon = computed(() => {
  if (!frontmatter.value.icon)
    // eslint-disable-next-line vue/no-side-effects-in-computed-properties
    frontmatter.value.icon = 'i-ri-folder-2-line'
  return frontmatter.value.icon
})

const posts = computed(() => {
  const list = site.postList.filter((post) => {
    if (post.categories && curCategory.value !== 'Uncategorized') {
      if (typeof post.categories === 'string')
        return post.categories === curCategory.value
      else
        return post.categories.join('/').startsWith(curCategory.value) && post.categories[0] === curCategory.value.split('/')[0]
    }
    if (!post.categories && curCategory.value === 'Uncategorized')
      return post.categories === undefined
    return false
  })
  return list
})

const { $tO } = useValaxyI18n()

useSchemaOrg([
  defineWebPage({
    '@type': 'CollectionPage',
  }),
])
</script>

<template>
  <YunLayoutWrapper>
    <YunLayoutLeft />

    <RouterView v-slot="{ Component }">
      <component :is="Component">
        <template #main-header>
          <YunPageHeader
            :title="$tO(frontmatter.title) || t('menu.categories')"
            :icon="pageIcon"
            :color="frontmatter.color"
            :page-title-class="frontmatter.pageTitleClass"
          />
        </template>
        <template #main-content>
          <Transition
            enter-active-class="animate-fade-in animate-duration-400"
            appear
          >
            <div text="center" class="yun-text-light" p="2">
              {{ t('counter.categories', Array.from(categories.children).length) }}
            </div>
          </Transition>
          <YunCategories :categories="categories.children" />
          <RouterView />
        </template>

        <template #main-nav-before>
          <YunCard v-if="curCategory" class="post-collapse-container" m="t-4" w="full">
            <YunPageHeader
              m="t-10"
              :title="curCategory === 'Uncategorized' ? t('category.uncategorized') : curCategory.split('/').join(' / ')"
              icon="i-ri-folder-open-line"
            />
            <YunPostCollapse w="full" m="b-4" p="x-20 lt-sm:x-5" :posts="posts" />
          </YunCard>
        </template>
      </component>
    </RouterView>

    <YunLayoutRight />
  </YunLayoutWrapper>

  <YunFooter />
</template>
