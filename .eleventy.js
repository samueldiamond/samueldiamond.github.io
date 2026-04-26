const rssPlugin = require("@11ty/eleventy-plugin-rss");
const { DateTime } = require("luxon");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(rssPlugin);

  // Only .md and .njk are processed as templates. Everything else (the
  // existing hand-written .html files, CSS, images, the PDF) is copied as-is.
  eleventyConfig.setTemplateFormats(["md", "njk"]);

  // The legacy Archive/ directory is repo history — keep it out of the build.
  eleventyConfig.ignores.add("Archive/**");
  eleventyConfig.ignores.add("README.md");

  // Pass-through copies for the hand-written site so 11ty's build output
  // (_site/) is a complete drop-in replacement for the current root.
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy("main.css");
  eleventyConfig.addPassthroughCopy("CNAME");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("posts");
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addPassthroughCopy("SamDiamond-Sovereign.pdf");
  eleventyConfig.addPassthroughCopy({ "_assets/blog.css": "blog/blog.css" });

  // Pretty date formatter: 2026-04-25 → "25 apr 2026"
  eleventyConfig.addFilter("readableDate", (date) =>
    DateTime.fromJSDate(date, { zone: "utc" })
      .toFormat("dd LLL yyyy")
      .toLowerCase()
  );
  eleventyConfig.addFilter("isoDate", (date) =>
    DateTime.fromJSDate(date, { zone: "utc" }).toISODate()
  );

  // Newest-first collection of all _blog/ entries (excludes drafts and the
  // collection data file itself).
  eleventyConfig.addCollection("blogPosts", (collectionApi) =>
    collectionApi
      .getFilteredByGlob("_blog/*.md")
      .filter((p) => !p.data.draft)
      .sort((a, b) => b.date - a.date)
  );

  return {
    dir: {
      input: ".",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
