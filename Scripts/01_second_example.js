// vscript is contextually defined for the sandbox, and points to the vscript library
// result(string) sends string to the result parameter in the Ember+ node

get_temp().then( () => { return; });

async function get_temp() {
	await vscript.connect_to("10.3.143.33");
	for (let i = 0; i < 10; i++) {
		let p = await vscript.read("system.temperature", "fpga_int");
		result(p);
		await vscript.pause_ms(1000);
	}
}