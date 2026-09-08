# BioSim seq_run — real sequencing layer output

Files
- reference.fa            synthetic reference (100 kb, chr_sim1)
- tumor_mix_R1/R2.fastq.gz  10,000 PE150 read pairs @30x
                            mixture: 90% WT clone / 10% antigen-loss escape clone
- truth.vcf               ground truth (1 antigen-loss SNV + 6 drivers, true VAF=5%)

Run a real pipeline:
bwa index reference.fa
bwa mem reference.fa tumor_mix_R1.fastq.gz tumor_mix_R2.fastq.gz | samtools sort -o tumor.bam -
samtools index tumor.bam
bcftools mpileup -f reference.fa tumor.bam | bcftools call -mv -Ov -o calls.vcf
# evaluate: how many of the 7 truth variants were called, and at what VAF?

LOD95 (calibrated): Illumina PE150 @2000x = 0.45% VAF | ONT @2000x = 1.85% VAF
