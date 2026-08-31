<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<h1>{page.status}</h1>
<p>{page.error?.message}</p>
<a href={resolve('/')}>Back to home</a>
