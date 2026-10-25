async page => {
  const fixture = await page.context().newPage();
  await fixture.setViewportSize({ width: 1280, height: 720 });
  await fixture.setContent('<body style="margin:0"><canvas width="1280" height="720"></canvas></body>');
  for (const [name, color] of [['a', '#8c2754'], ['b', '#205d83']]) {
    await fixture.evaluate(({name,color}) => {
      const canvas = document.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color; ctx.fillRect(0,0,1280,720);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 70px sans-serif';
      ctx.fillText('ROYALLAGN DUMMY TEST',100,300); ctx.fillText('2026-10-25 / '+name,100,420);
    }, {name,color});
    await fixture.screenshot({path:`/private/tmp/royallagn-media-test-${name}.png`});
  }
  const downloadPromise = fixture.waitForEvent('download');
  await fixture.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, {mimeType:'video/webm'});
    const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const stopped = new Promise(resolve => recorder.onstop = resolve);
    recorder.start();
    const context=canvas.getContext('2d');
    for(let frame=0;frame<20;frame++) {
      context.fillStyle=frame%2?'#205d83':'#8c2754'; context.fillRect(0,0,1280,720);
      context.fillStyle='#fff'; context.font='bold 60px sans-serif';
      context.fillText('ROYALLAGN DUMMY VIDEO '+frame,80,360);
      await new Promise(resolve => setTimeout(resolve,100));
    }
    recorder.stop(); await stopped; stream.getTracks().forEach(track=>track.stop());
    const link=document.createElement('a'); link.href=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
    link.download='royallagn-media-test.webm'; link.click();
  });
  await (await downloadPromise).saveAs('/private/tmp/royallagn-media-test.webm');
  await fixture.close();
  return 'Created two labeled PNG images and a 1.5-second WebM video';
}
