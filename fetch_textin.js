import https from 'https';
https.get('https://www.textin.com/document/text_auto_removal', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const jsonMatch = data.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      const html = parsed.props.pageProps.apiDetail.html;
      const responseSection = html.split('<h2>响应体说明')[1];
      console.log(responseSection ? responseSection.substring(2000, 4000) : 'Not found');
    }
  });
});
