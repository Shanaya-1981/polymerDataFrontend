The ultimate goal of this project is to develop a pipeline for scientists to extract data they want from the uploaded PDF. To do that, first step is to parse the PDF they uploaded. So we want to extract:

- The text
- The image
- The table
  Basically everything in the paper. Then we will send the parsed information, the extracted information along with the data scientist wants to a selected LLM, in hoping that the LLM will extract the data from these pieces we provided. For example the scientist wants the to extract data (headers of data/\_Cleaned_Final_Data_6_2_2020.csv) from all the papers from the papers directory. Those data may be found directly from text, or table but some may require figure undersanding.

The first step is to extract information from the given paper. We use minerU library for that. For each paper, we want the text, any tables or figures. Figures should be cropped. All of these information should be stored somewhere for the next step.

The next step is sending all this information we extracted, the text, the figures, the table, along with the data user wants to extract to a LLM of choice.

So, the first step is to build the pipeline, which includes extraction and LLM integration. Then we want to test how well this pipeline performs against our golden set (data/\_Cleaned_Final_Data_6_2_2020.csv). Then iterate and improve.
