import { isHyperErr } from '../../deps.js'
import { assert, assertEquals } from '../../dev_deps.js'

import { checkName } from '../../lib/utils.js'

const { test } = Deno

test('checkName', async (t) => {
  await t.step('should resolve with the name', async () => {
    const name = '/path/to/file/./here'

    await checkName(name)
      .map((res) => assertEquals(res, name))
      .toPromise()
  })

  await t.step('should reject with a HyperErr', async () => {
    const invalidName = '/path/../to/a/file'

    await checkName(invalidName)
      .coalesce(
        (err) => {
          assert(isHyperErr(err))
          assert(typeof err.msg === 'string')
          return
        },
        () => {
          throw new Error('this shouldn\'t happen')
        },
      )
      .toPromise()
  })
})
