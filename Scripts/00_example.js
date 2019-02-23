// vscript is contextually defined for the sandbox, and points to the vscript library
// result(string) sends string to the result parameter in the Ember+ node
// Scripts are loaded in alphabetical order; references in VSM will rely on the order so keep this in mind when adding new scripts!
get_temp().then( () => { return; });

async function get_temp() {
	await vscript.connect_to("10.3.143.33");
	let p = await vscript.read("system", "booted_partition");
	result(p);
}